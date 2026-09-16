import { promises as fs } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { Chat, ToolDefinition } from './types.js';

/** Local immutable attachment paths only; this does not fetch remote URLs. */
export async function codexInput(messages: Chat[], tools: ToolDefinition[]) {
  const images: { type: 'localImage'; path: string }[] = [];
  let totalBytes = 0;
  const context: Chat[] = [];
  for (const message of messages) {
    const references: { name: string; imageIndex: number }[] = [];
    for (const image of message.images ?? []) {
      if (images.length >= 4) throw new Error('At most four images can be inspected per generation');
      if (!isAbsolute(image.path)) throw new Error('Image attachment path must be absolute');
      const file = await fs.open(image.path, 'r');
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 5_000_000) throw new Error('Image attachment must be a file under 5 MB');
        totalBytes += stat.size;
        if (totalBytes > 12_000_000) throw new Error('Images exceed the 12 MB generation limit');
        const header = Buffer.alloc(16);const { bytesRead } = await file.read(header, 0, 16, 0);
        const png = header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
        const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
        const gif = ['GIF87a','GIF89a'].includes(header.toString('ascii',0,6));
        const webp = header.toString('ascii',0,4) === 'RIFF' && header.toString('ascii',8,12) === 'WEBP';
        if (bytesRead < 12 || !(png || jpeg || gif || webp)) throw new Error('Unsupported or invalid image attachment; use PNG, JPEG, GIF or WebP');
      } finally { await file.close(); }
      images.push({type:'localImage',path:image.path});
      references.push({name:image.name,imageIndex:images.length});
    }
    const { images: omitted, ...text } = message;
    context.push({...text,content:text.content+(references.length ? '\nAttached image order: '+JSON.stringify(references) : '')});
  }
  return [{type:'text',text:JSON.stringify({messages:context,tools}),text_elements:[]},...images];
}
