import fs from "fs";

const s = "Safe";
const v = "Vulnerable";

// const name = "kwaipilotkat-coder-pro:free-GRAPH";
// const name = "openaigpt-oss-120b:free-MULTIPLE";
const name = "openaigpt-oss-120b:free-JSON_GRAPH_CPG-SHORTER_VER";
const dataString = fs.readFileSync(`results/${name}.json`);
const data = JSON.parse(dataString);

console.log("TP,TN,FN,FP");
let tp = 0;
let tn = 0;
let fn = 0;
let fp = 0;

for (const el of data) {
  if (el.received !== s || el.received !== v) {
    el.received = el.received.includes(s) ? s : v;
  }
  if (el.received === s && el.expected === s) {
    tp++;
  } else if (el.received === v && el.expected === v) {
    tn++;
  } else if (el.received === s && el.expected === v) {
    fp++;
  } else if (el.received === v && el.expected === s) {
    fn++;
  } else {
    console.log(`incorrect: ${el.received}`);
  }
}

console.log(`${tp},${tn},${fn},${fp}`);

const precision = tp / (tp + fp);
const recall = tp / (tp + fn);
console.log(`Accuracy: ${(tp + tn) / (tp + fp + fn + tn)}`);
console.log(`Precision: ${precision}`);
console.log(`Recall: ${recall}`);
console.log(`F1Score: ${(2 * (precision * recall)) / (precision + recall)}`);
