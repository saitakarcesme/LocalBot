import Foundation

@main struct ProgressChecks {
  static func task(_ id: String, _ status: String) -> AgentTask {
    AgentTask(id: id, conversationId: "chat", messageId: "message", prompt: "", status: status, error: nil, createdAt: "", updatedAt: "")
  }
  static func main() {
    let running = task("running", "running")
    let queued = task("queued", "queued")
    precondition(ConversationProgress.activeTask(in: [queued, running])?.id == running.id)
    let approval = task("approval", "awaiting_approval")
    precondition(ConversationProgress.activeTask(in: [queued, approval])?.id == approval.id)
    precondition(ConversationProgress.activeTask(in: [queued, task("older", "queued")])?.id == "older")
    precondition(ConversationProgress.activeTask(in: [task("question", "awaiting_input")]) == nil)
    let run = ActiveRun(id: "run", taskId: running.id, agentId: "coder", status: "running")
    precondition(ConversationProgress.indicator(task: running, run: run, sending: true) == .typing)
    precondition(ConversationProgress.indicator(task: queued, run: run, sending: false) == .queued)
    precondition(ConversationProgress.indicator(task: running, run: nil, sending: false) == .preparing)
    precondition(ConversationProgress.indicator(task: approval, run: run, sending: false) == .approval)
    precondition(ConversationProgress.indicator(task: nil, run: nil, sending: true) == .sending)
    precondition(ConversationProgress.indicator(task: nil, run: nil, sending: false) == .hidden)
    print("Conversation progress checks passed")
  }
}
