import test from 'node:test';
import assert from 'node:assert/strict';
import {openLicense,parseCandidateExamples} from '../dist/fine-tune-dataset.js';
test('automatic examples require explicit license links and verbatim support',()=>{
 assert.equal(openLicense('This is public information'),null);
 assert.equal(openLicense('https://creativecommons.org/licenses/by/4.0/'),'CC-BY-4.0');
 const text='A sufficiently long factual sentence from the original primary source.';
 const rows=JSON.stringify([{prompt:'What does the source say?',answer:text},{prompt:'Invent something?',answer:'This fabricated answer has absolutely no supporting evidence.'}]);
 assert.equal(parseCandidateExamples(rows,text).length,1);
 assert.deepEqual(parseCandidateExamples('not json',text),[]);
});
