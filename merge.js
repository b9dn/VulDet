import fs from "fs";

const merge = (files, output = "./results/nvidianemotron-3-super-120b-a12bfree-CONTEXT.json") => {
  let result = [];

  for (const name of files) {
    const dataString = fs.readFileSync(name);
    const data = JSON.parse(dataString);

    result = result.concat(data);
  }

  fs.writeFileSync(
    output,
    JSON.stringify(result, null, 2)
  );
};

merge(["./results/nvidianemotron-3-super-120b-a12bfree-SAFE_CONTEXT.json", "./results/nvidianemotron-3-super-120b-a12bfree-VULNERABLE_CONTEXT.json"]);
