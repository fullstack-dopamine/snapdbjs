# Contributing to SnapDBJS

We love your input! We want to make contributing to SnapDBJS as easy and transparent as possible.

## Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Setting Up Development Environment

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/snapdbjs.git
cd snapdbjs

# Install dependencies
npm install

# Run tests
npm test

# Run benchmarks
npm run benchmark

# Build the project
npm run build
```

## Code Style

- We use TypeScript for all source code
- Follow the existing code style
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

## Testing

- Write unit tests for new functionality
- Ensure all tests pass before submitting PR
- Aim for high test coverage
- Test edge cases and error conditions

## Pull Request Process

1. Update the README.md with details of changes to the interface
2. Update the CHANGELOG.md with your changes
3. The PR will be merged once you have the sign-off of maintainers

## Any contributions you make will be under the MIT Software License

When you submit code changes, your submissions are understood to be under the same [MIT License](LICENSE) that covers the project.

## Report bugs using GitHub's [issue tracker](https://github.com/fullstack-dopamine/snapdbjs/issues)

We use GitHub issues to track public bugs. Report a bug by opening a new issue.

**Great Bug Reports** tend to have:
- A quick summary and/or background
- Steps to reproduce
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening)