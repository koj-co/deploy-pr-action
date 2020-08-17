import { getInput, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import slugify from "@sindresorhus/slugify";
import { execSync } from "child_process";
import { writeFile } from "fs-extra";

const createRobotsTxt = (path: string) =>
  writeFile(
    path,
    `User-agent: *
Disallow: /`
  );

export const run = async () => {
  const token = getInput("token") || process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub token not found");

  execSync("npm install --global surge");

  const prefix =
    getInput("prefix") || slugify(`${context.repo.owner}/${context.repo.repo}`);
  const robotsTxtPath = getInput("robotsTxtPath");
  const distDir = getInput("distDir");
  const octokit = getOctokit(token);

  if (robotsTxtPath) await createRobotsTxt(robotsTxtPath);

  if (!context.payload.pull_request && context.ref) {
    const slug = slugify(context.ref.replace("refs/heads/", ""));
    console.log("Deploying commit", slug);
    try {
      const result = execSync(
        `surge --project ${distDir} --domain ${prefix}-${slug}.surge.sh`
      ).toString();
      console.log(result);
    } catch (error) {
      console.log(error);
      setFailed("Deployment error");
    }
    console.log("Deployed", `https://${prefix}-${slug}.surge.sh`);
  }

  if (!context.payload.pull_request) return console.log("Skipping: Not a PR");
  const slug = slugify(context.payload.pull_request.head.ref);
  const prNumber = context.payload.pull_request.number;
  console.log(`Deploying ${prNumber}`, slug);

  try {
    const result = execSync(
      `surge --project ${distDir} --domain ${prefix}-${slug}.surge.sh`
    ).toString();
    console.log(result);
    console.log("Deployed", `https://${prefix}-${slug}.surge.sh`);
  } catch (error) {
    console.log(error);
    setFailed("Deployment error");
  }

  await octokit.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: prNumber,
    body: `This pull request has been automatically deployed.
✅ Preview: https://${prefix}-${slug}.surge.sh
🔍 Logs: https://github.com/${context.repo.owner}/${context.repo.repo}/actions/runs/${process.env.GITHUB_RUN_ID}`,
  });
  console.log("Added comment to PR");

  await octokit.issues.addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: prNumber,
    labels: ["deployed"],
  });
  console.log("Added label");

  const deployment = await octokit.repos.createDeployment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    ref: context.ref,
    environment: "staging",
    production_environment: false,
  });
  console.log("Added deployment");

  await octokit.repos.createDeploymentStatus({
    owner: context.repo.owner,
    repo: context.repo.repo,
    deployment_id: (deployment.data as any).id,
    state: "success",
  });
  console.log("Added deployment status");
};

run();
