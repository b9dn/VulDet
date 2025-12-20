import fs from "fs";

const s = "Safe";
const v = "Vulnerable";

const results = [];

const calc = (name) => {
  const dataString = fs.readFileSync(`results/${name}`);
  const data = JSON.parse(dataString);

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
      console.log(`incorrect: ${el.received} for file ${name}`);
    }
  }

  const precision = tp / (tp + fp);
  const recall = tp / (tp + fn);
  results.push({
    file: name,
    tp: tp,
    tn: tn,
    fn: fn,
    fp: fp,
    precision: precision,
    recall: recall,
    f1score: (2 * (precision * recall)) / (precision + recall),
  });
};

fs.readdir("./results", (err, files) => {
  if (err) {
    console.error(err);
    return;
  }

  files.forEach((file) => {
    calc(file);
  });
  
  console.log(results);
});
