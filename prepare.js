const fs = require("fs");
const path = require("path");
const sqlite = require("sqlite3");

const folderPath = "./data/";
const depth = 1;

const db = new sqlite.Database("data.sqlite");

db.run(`CREATE TABLE IF NOT EXISTS data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    names TEXT,
    code TEXT,
    codeVul TEXT,
    codeContext TEXT,
    codeVulContext TEXT
)`);

const stmt = db.prepare(
  `INSERT INTO data (names, code, codeVul, codeContext, codeVulContext)
   VALUES (?, ?, ?, ?, ?)`,
);

const readContext = (jsonData) => {
  code = "";

  jsonData.importContext.forEach((include) => {
    code += include + "\n";
  });

  jsonData.typeDefs.forEach((typeDef) => {
    code += typeDef[0] + "\n";
  });

  jsonData.calleeMethods.forEach((fun) => {
    if (fun[3] <= depth) {
      code += fun[2] + "\n";
    }
  });

  return code;
};

const files = fs.readdirSync(folderPath).filter((file) => {
  return fs.statSync(path.join(folderPath, file)).isFile();
});

files.forEach((file) => {
  const data = fs.readFileSync(folderPath + file, "utf8");
  const jsonData = JSON.parse(data);

  let context = readContext(jsonData);

  let safe = "";
  let vul = "";

  let names = "";

  jsonData.vulnerableMethods_before.forEach((method) => {
    vul += method[2] + "\n";
    names += method[1] + "";
  });

  jsonData.vulnerableMethods_after.forEach((method) => {
    safe += method[2] + "\n";
  });

  if ((context + vul).length < 3000) {
    stmt.run(names, safe, vul, context + safe, context + vul);
  }
});
