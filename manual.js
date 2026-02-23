import sqlite from "sqlite3";
import fs from "fs";
import readline from "readline";

const db = new sqlite.Database("data.sqlite");

const useContext = false;
const isSafe = true;

const name = "GEMINI3-quickdasdsa";
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
  ? `WHERE id NOT IN (${checkedIds.join(",")}) and id > 20`
  : "where id > 20";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

const initMessage = `Role: Act as an Expert Security Code Auditor specializing in C/C++ memory safety and pointer arithmetic.

Task: Conduct a deep-dive security analysis of the provided C code to identify exploitable vulnerabilities (e.g., CWE-119, CWE-190, CWE-476, CWE-822).

Instructions:
1. Data Flow Trace: For the specified function, create a step-by-step trace of critical variables. Specifically, note how 'length' or 'size' variables change and how they are used in memory allocations or array indexing.
2. Pointer & Boundary Analysis: 
   - Identify every array access or pointer dereference. 
   - State the maximum possible value of the index vs. the allocated size.
   - Check for "Off-by-one" errors in loop termination conditions (e.g., <= vs <).
3. Integer Safety: Check all arithmetic involving \`size_t\`, \`int\`, or \`uint16_t\`. Explicitly look for:
   - Underflow when subtracting from a length (e.g., len - 8).
   - Overflow when calculating allocation sizes (e.g., count * size).
   - Sign-extension issues when casting signed to unsigned.
4. Edge Case Validation: Evaluate behavior for:
   - Empty inputs (len = 0, NULL pointers).
   - Minimum/Maximum integer values.
   - Malformed headers or control characters.

Output Format:
- Technical Breakdown: [Detailed analysis of data flow and arithmetic]
- Vulnerability Type: [e.g., Heap Buffer Overflow, Integer Underflow]
- Trigger Scenario: [What specific input causes the crash/exploit?]
- [RESULT]: VULNERABLE or SAFE

in one last line summarize you answers with this format:

Sample 1: Safe | Vulnerable ;Sample 2: Safe | Vulnerable

Samples Code:
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
