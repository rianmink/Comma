// Driver for csv-reader-speed-01. Node 22 runs this file: it reads every case from
// /input/cases.json, answers each one alone with run() from solve.js, and writes
// /output/answers.json, a JSON array in case order. Outside a container
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.
//
// V8 flags are set before solve.js is imported. Incremental marking and the
// background compiler/GC threads are off so their CPU is not added to the run.

import { openSync, readFileSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString(
  '--no-incremental-marking --no-concurrent-recompilation --no-concurrent-sparkplug --no-concurrent-osr --no-concurrent-marking --no-concurrent-sweeping',
);

/** solve.js, imported by its URL (a .js module carries no types) and typed by its contract. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

// A flat sample, so the parser is already optimized when the cases start.
const warm = JSON.parse(
  '"h1,h2,h3,h4,h5,h6,h7,h8\\r\\n1,\\"a,b\\",3,4,5,6,7,8\\n9,10,\\"c\\"\\"d\\",12,13,14,15,16\\na\\rb,2,3,4,5,6,7,8\\n\\"x\\ny\\",2,3,4,5,6,7,8\\n\\"z\\"junk,2,3,4,5,6,7\\n1,2\\n1,2,3,4,5,6,7,8,9\\n\\n"',
) as string;
run({ text: warm, header: true });
run({ text: warm + warm, header: false });

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as { id: string; input: unknown }[];

// One answer at a time: the bytes are JSON.stringify of the whole array, and each
// answer can be collected before the next case is parsed.
const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  if (i !== 0) writeSync(fd, ',');
  writeSync(fd, JSON.stringify(run(cases[i]!.input)));
}
writeSync(fd, ']');
closeSync(fd);
