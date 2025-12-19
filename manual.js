import sqlite from "sqlite3";
import fs from "fs";
import readline from "readline";
import clipboard from "clipboardy";

const db = new sqlite.Database("./data.sqlite");

const name = "GPT-5-Mini";
const samplesInOneRequestNum = 10;
const path = `./results/${name.replace(/\//g, "")}-MANUAL.json`;
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

const initMessage = `From now on you are a security analysis assistant. Your job is to review code for vulnerabilities and security risks.

From now on for any given question you will be given code samples for security vulnerabilities and your job is to answer based on given rules and format below.

Rules:
- Evaluate each code sample independently.
- For each sample, return exactly one word: "Safe" or "Vulnerable".
- Do not explain your answers.
- Do not rewrite the code.
- Do not add any extra text.

Output format (in one line):
Sample 1: Safe | Vulnerable;Sample 2: Safe | Vulnerable`;

let counter = 0;
const currResults = [];

db.all(`SELECT * FROM data ${whereClause} ORDER BY RANDOM()`, async (err, rows) => {
  while (true) {
    const chosenRows = rows.slice(
      counter * samplesInOneRequestNum,
      (counter + 1) * samplesInOneRequestNum
    );
    const text = chosenRows
      .map(
        (el, index) => `
Sample ${index + 1}:
\`\`\`
${el.code}
\`\`\`
`
      )
      .join();

    clipboard.writeSync(text);
    console.log(text);
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
        expected: chosenRows[i].isVulnerable ? "Vulnerable" : "Safe",
        received: formattedResponse[i].split(":")[1].trim(),
      });
    }

    counter++;
  }

  rl.close();
  const combined = [...prevResults, ...currResults];
  fs.writeFileSync(path, JSON.stringify(combined));
});
