import { randomUUID } from "node:crypto";
import { type ModelServer, validateModelServer } from "./center.js";
import { type RPCRequest } from "./protocol.js";
type Job = {
  owner: string;
  controller: AbortController;
  chunks: Buffer[];
  size: number;
  done: boolean;
  error?: string;
  status?: number;
  contentType: string;
  created: number;
};
export class ModelJobs {
  private jobs = new Map<string, Job>();
  async handle(server: ModelServer, request: RPCRequest, owner: string) {
    for (const [id, job] of this.jobs)
      if (Date.now() - job.created > 900000) {
        job.controller.abort();
        this.jobs.delete(id);
      }
    if (request.operation === "model_start") {
      validateModelServer(server);
      const path = server.kind === "ollama" ? "/api/chat" : "/chat/completions";
      if (request.path !== path || request.method !== "POST")
        throw Error("Model route not allowed");
      if ([...this.jobs.values()].filter((j) => !j.done).length >= 2)
        throw Error("The model PC is busy. Wait for its current generation.");
      if (this.jobs.size >= 20)
        throw Error("Too many pending model results. Reconnect Center.");
      const id = randomUUID(),
        controller = new AbortController();
      const job: Job = {
        owner,
        controller,
        chunks: [],
        size: 0,
        done: false,
        contentType:
          server.kind === "ollama"
            ? "application/x-ndjson"
            : "text/event-stream",
        created: Date.now(),
      };
      this.jobs.set(id, job);
      void (async () => {
        try {
          const response = await fetch(
            server.endpoint.replace(/\/$/, "") + path,
            {
              method: "POST",
              redirect: "error",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request.body),
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(900000),
              ]),
            },
          );
          job.status = response.status;
          if (!response.ok)
            throw Error(`Model server returned HTTP ${response.status}`);
          if (response.body)
            for await (const bytes of response.body as any) {
              job.size += bytes.length;
              if (job.size > 8000000) throw Error("Model output exceeded 8 MB");
              job.chunks.push(Buffer.from(bytes));
            }
        } catch (e) {
          job.error = e instanceof Error ? e.message : "Model request failed";
        } finally {
          job.done = true;
        }
      })();
      return { job: id, contentType: job.contentType };
    }
    const body = request.body as any,
      job = this.jobs.get(body?.job);
    if (!job || job.owner !== owner)
      throw Error("Model job not found on this connection");
    if (request.operation === "model_cancel") {
      job.controller.abort();
      this.jobs.delete(body.job);
      return { ok: true };
    }
    if (request.operation !== "model_poll")
      throw Error("Unsupported model operation");
    if (
      !Number.isInteger(body.offset) ||
      body.offset < 0 ||
      body.offset > job.size
    )
      throw Error("Invalid model stream offset");
    if (job.error) throw Error(job.error);
    const bytes = Buffer.concat(job.chunks);
    const end = Math.min(bytes.length, body.offset + 128000);
    return {
      data: bytes.subarray(body.offset, end).toString("base64"),
      offset: end,
      done: job.done && end === bytes.length,
    };
  }
  revoke(owner: string) {
    for (const [id, job] of this.jobs)
      if (job.owner === owner) {
        job.controller.abort();
        this.jobs.delete(id);
      }
  }
  close() {
    for (const job of this.jobs.values()) job.controller.abort();
    this.jobs.clear();
  }
}
