import sqlite from "sqlite3";
import fs from "fs";
import readline from "readline";

const db = new sqlite.Database("data.sqlite");

const useContext = false;
const isSafe = false;

const name = "GEMINI3-quick";
const samplesInOneRequestNum = 5;
const path = `./results/${name.replace(/\//g, "")}-${isSafe ? "Safe" : "Vul"}-${useContext ? "Context" : "NoContext"}-SIMPLE-MANUAL.json`;
let prevResults;

if (fs.existsSync(path)) {
  const data = fs.readFileSync(path);
  prevResults = JSON.parse(data);
} else {
  prevResults = [];
}

const checkedIds = prevResults.map((val) => {
  return val.id;
});

const whereClause = checkedIds.length
  ? `WHERE id NOT IN (${checkedIds.join(",")})`
  : "";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

const initMessage = `Analyze the following c code samples for vulnerabilities.

Rules:
- Evaluate each code sample independently.
- For each sample, return exactly one word: "Safe" or "Vulnerable".
- Do not explain your answers.
- Do not rewrite the code.
- Do not add any extra text.

Output format (in one line) chose either Safe or Vulnerable and devide answers with ; example:
Sample 1: Safe | Vulnerable;Sample 2: Safe | Vulnerable

...
Code samples:

`;

let counter = 0;
const currResults = [];

db.all(`SELECT * FROM data ${whereClause}`, async (err, rows) => {
  while (true) {
    try {
      const chosenRows = rows.slice(
        counter * samplesInOneRequestNum,
        (counter + 1) * samplesInOneRequestNum,
      );
      const text = chosenRows
        .map((el, index) => {
          let code;
          if (isSafe) {
            if (useContext) {
              code = el.codeContext;
            } else {
              code = el.code;
            }
          } else {
            if (useContext) {
              code = el.codeVulContext;
            } else {
              code = el.codeVul;
            }
          }
          console;
          return `Sample ${index + 1} (functions to check for vulnerability: ${el.names}):
\`\`\`
${code}
\`\`\``;
        })
        .join("\n");

      fs.writeFileSync("test.txt", initMessage + text);

      const answer = await askQuestion("Answer: ");

      if (answer === "exit") {
        break;
      }

      const formattedResponse = answer.split(";");
      if (formattedResponse.length !== chosenRows.length) {
        console.error("Invalid response data length");
      }

      for (let i = 0; i < chosenRows.length; i++) {
        currResults.push({
          id: chosenRows[i].id,
          expected: isSafe ? "Safe" : "Vulnerable",
          received: formattedResponse[i].split(":")[1].trim(),
        });
      }

      counter++;
    } catch (e) {
      console.log(e);
      break;
    }
  }

  rl.close();
  const combined = [...prevResults, ...currResults];
  fs.writeFileSync(path, JSON.stringify(combined));
});
