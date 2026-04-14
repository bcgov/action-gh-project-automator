# 🚀 Project Board Rule Engine

[![Node.js 24+](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![ES Modules](https://img.shields.io/badge/module-ESM-blue.svg)](https://nodejs.org/api/esm.html)
[![Checks](https://img.shields.io/badge/Stability-Ludicrous%20Coverage-orange.svg)](#stability--predictability)

**Project Board Rule Engine** is a high-performance GitHub Projects v2 automation tool designed to synchronize issues and pull requests across complex, multi-repository environments with 100% predictability.

## ✨ Overview

This action transforms your GitHub Project into a self-driving productivity engine. It eliminates manual board maintenance by implementing a rule-based state machine for:

- **Intelligent Intake**: Automatically adds PRs and issues to the project board based on authorship, assignment, or repository source.
- **Dynamic Workflows**: Moves items between columns based on real-time state changes and linked issue status.
- **Sprint Orchestration**: Seamlessly manages sprint assignments, rollovers, and capacity planning.
- **Smart Inheritance**: Propagates metadata (assignees, sprints, columns) between PRs and their linked issues.
- **Cross-Boundary Mastery**: Monitors and manages activity across multiple organizations and repositories simultaneously.

## 🛡️ Stability & Predictability

We treat stability as a first-class feature. Our "Ludicrous Testing" philosophy ensures that every rule processed is verified against a comprehensive matrix of conditions.

- **Hardcoded Validation**: We use a strict whitelist-based validator to ensure rule evaluation is 100% predictable.
- **Native Efficiency**: Built on **Node.js 24** and native **ES Modules** for lightning-fast, future-proof execution.
- **Zero-Network Tests**: Our 300+ count test suite runs in pure isolation, guaranteeing core logic is bulletproof.

## ⚙️ Configuration

Configure your entire workflow in a single, version-controlled `rules.yml` file.

### Project Connection
The tool resolves your project identity with minimal friction:

```yaml
project:
  url: https://github.com/orgs/YOUR_ORG/projects/1
```

### Resource Monitoring
Define which realms the engine should govern:

```yaml
project:
  allowedOrgs:
    - your-main-org
    - your-community-org
```


## 🛠️ Development & Specs

This project follows a **Spec-Driven Development** model using the [SpecKit](https://github.com/github/spec-kit) framework.

- **SpecKit Architecture**: Documentation for our feature specifications lives in the `specs/` directory. See the [SpecKit README](specs/README.md) for usage guidelines.
- **Rule Engine Spec**: See [Spec 004](specs/004-rule-engine-architecture/spec.md) for a deep dive into our validation architecture.
- **Project Constitution**: Review [memory/constitution.md](memory/constitution.md) for our core development principles and "Ludicrous Testing" standards.
- **AI Pair Programming**: See [.github/copilot-instructions.md](.github/copilot-instructions.md) for guidance when working with AI coding assistants.

## 🧪 Testing

We value exhaustive verification. Run the full suite, including the ludicrous coverage matrix:

```bash
npm test
```

For targeted testing of the core engines:
```bash
# Test the unified rule processor
npm test -- test/processors/unified-rule-processor.test.js

# Test the ludicrous validation matrix
npm test -- test/processors/ludicrous-coverage.test.js
```

---
*Built with ❤️ by the Advanced Project Automation Team.*
