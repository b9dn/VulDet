import fs from "fs";

const name = "/contextvsno/geminiCONTEXT";

const dataString = fs.readFileSync(`results/${name}.json`);
const data = JSON.parse(dataString);

let sum = 0;

for (const el of data) {
    sum += el.numTokensInput
}

console.log(sum / data.length)