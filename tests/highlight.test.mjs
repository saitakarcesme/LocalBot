import test from 'node:test';
import assert from 'node:assert/strict';
import {highlight,supportedLanguages} from '../ui/src/highlight.js';
test('highlighter supports full grammars and escapes untrusted markup',()=>{
 assert(supportedLanguages().length>=180);
 assert.match(highlight('const count = 42;','javascript'),/hljs-keyword/);
 assert.match(highlight('SELECT id FROM users','sql'),/hljs-keyword/);
 assert.equal(highlight('<script>alert(1)</script>','unknown'),'&lt;script&gt;alert(1)&lt;/script&gt;');
});
