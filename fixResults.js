import fs from "fs";

const fix = (name) => {
  const dataString = fs.readFileSync(`results/${name}`);
  const data = JSON.parse(dataString);
  for (let i = 0; i < data.length; i++) {
    const el = data[i];
    if (el.received !== "Vulnerable" && el.received !== "Safe") {
      if (el.received.includes("Vulnerable")) {
        data[i].received = "Vulnerable";
      } else if (el.received.includes("Safe")) {
        data[i].received = "Safe";
      } else {
        console.log(`error with: ${name} id:${el.id}`);
      }
    }
  }
  const stringFixed = JSON.stringify(data);
  fs.writeFileSync(`results/${name}`, stringFixed);
};

fs.readdir("./results", (err, files) => {
  if (err) {
    console.error(err);
    return;
  }

  files.forEach((file) => {
    fix(file);
  });
});
