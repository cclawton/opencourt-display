# Agent Toolkit for AWS

OpenCourt uses the official [Agent Toolkit for AWS](https://aws.amazon.com/products/developer-tools/agent-toolkit-for-aws/) for agent-assisted AWS design, deployment and operations. The toolkit supplies current AWS documentation, curated AWS skills and a managed MCP server with IAM controls and audit visibility.

## Codex setup

Install `uv`, then add the official marketplace and the core AWS plugin:

```bash
codex plugin marketplace add aws/agent-toolkit-for-aws
codex plugin add aws-core@agent-toolkit-for-aws
```

Confirm that `aws-core@agent-toolkit-for-aws` is shown as installed and enabled:

```bash
codex plugin list
```

Reload Codex or start a new chat after installation so that its AWS MCP tools and skills are included in the session. AWS credentials are optional for documentation search and required for authenticated AWS API calls. Credentials remain local and must never be added to this repository.

AWS also offers `aws configure agent-toolkit` with AWS CLI 2.35 or newer. The Codex plugin installation above is the supported path when an older AWS CLI is installed, so upgrading the CLI is not a prerequisite for this project.

## Project guardrails

The repository's [`AGENTS.md`](../AGENTS.md) customises the toolkit guidance for OpenCourt:

- deploy Regional resources only in `ap-southeast-2`;
- prefer CDK and review synthesized changes before deployment;
- preserve the tiny-club cost limits and deletion safeguards;
- use least-privilege, short-lived credentials;
- keep resource names and tags portable to a future club-owned account; and
- never deploy before confirming the target account and billing-alert email.

The toolkit itself has no additional charge. Normal AWS service charges still apply to resources it accesses or creates.
