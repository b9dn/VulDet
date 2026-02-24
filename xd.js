import fs from "fs";

const name = "results/stepfunstep-3.5-flashfree-VULNERABLE";
const dataString = fs.readFileSync(`${name}.json`);
const data = JSON.parse(dataString);

let calc = 0;

data.forEach((element) => {
  if (element.received === "Safe") {
    calc += 1;
  }
});

console.log(calc);
console.log(data.length);
