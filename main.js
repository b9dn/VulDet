import dotenv from "dotenv";
import sqlite from "sqlite3";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";

dotenv.config();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI });
const db = new sqlite.Database("./data.sqlite");

const name = "arcee-ai/trinity-large-preview:free";
// const name = "gemini-2.5-flash";
const isGemini = false;
const requestLimit = 100;
const sleepTime = 3;
const testType = "Vulnerable"; // Safe or Vulnerable

const sendMessageOR = async (data, model, key = process.env.OPENROUTER) => {
  const messages = [
    { 
      role: "system",
      content: "You are a security analysis assistant. Your job is to strictly review code for real, exploitable security vulnerabilities."
    },
    {
      role: "user",
      content: `Analyze the following code strictly for actual, exploitable security vulnerabilities.
  
  Rules:
  - Answer ONLY with a single word: "Safe" or "Vulnerable"
  - Answer "Safe" if there are no clear, exploitable vulnerabilities present
  - Answer "Vulnerable" ONLY if you find a concrete, specific vulnerability (e.g. SQL injection, XSS, path traversal, hardcoded secrets, command injection, etc.)
  - Do NOT flag theoretical risks, bad practices, missing best practices, or stylistic issues
  - Do NOT include any explanation, list, or additional text - just one word
  
  Code:
  \`\`\`
  ${testType == "Safe" ? data.codeContext : data.codeVulContext}
  \`\`\``,
    },
  ];

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        reasoning: { enabled: true },
      }),
    },
  );

  const result = await response.json();

  return {
    id: data.id,
    expected: testType,
    received: result.choices[0].message.content,
    numTokensInput: result.usage.prompt_tokens,
    numTokensOutput: result.usage.completion_tokens,
    numTokensThought: result.usage.completion_tokens_details.reasoning_tokens,
  };
};

const sendMessageGemini = async (data, model) => {
  const message = `Analyze the following functions: ${data.names} written in c programming language for vulnerabilities.

Rules:
- Return exactly one word: "Safe" or "Vulnerable".
- Do not explain your answers.
- Do not rewrite the code.
- Do not add any extra text.
Code:
      \`\`\`
      ${data.code}
      \`\`\``;

  const response = await ai.models.generateContent({
    model: model,
    contents: message,
  });

  return {
    id: data.id,
    expected: "Safe",
    received: response.text.replace(/\n/g, ""),
    numTokensInput: response.usageMetadata.promptTokenCount,
    numTokensOutput: response.usageMetadata.candidatesTokenCount,
    numTokensThought: response.usageMetadata.thoughtsTokenCount,
  };
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const path = `./results/${name.replace(/[<>:"/\\|?*]/g, "")}-VULNERABLE_CONTEXT.json`;
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

const whereClause = `WHERE id NOT IN (${checkedIds.join(",")})`;

const promises = [];

db.all(
  `SELECT * FROM data ${whereClause} LIMIT ${requestLimit}`,
  async (err, rows) => {
    if (err) return console.error(err.message);
    for (const data of rows) {
      if (isGemini) {
        promises.push(
          sendMessageGemini(data, name).catch((err) => {
            console.error("Error", err.message);
            return null;
          }),
        );
      } else {
        promises.push(
          sendMessageOR(data, name).catch((err) => {
            console.error("Error", err.message);
            return null;
          }),
        );
      }

      console.log("Next");
      await sleep(sleepTime * 2000);
    }

    Promise.all(promises).then((currResults) => {
      const combined = [
        ...prevResults,
        ...currResults.filter((item) => item !== null),
      ];
      fs.writeFileSync(path, JSON.stringify(combined));
    });
  },
);
