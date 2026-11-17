FROM oven/bun:1.2.22-alpine
RUN addgroup -S runner && adduser -S runner -G runner
WORKDIR /workspace
USER runner
CMD ["bun", "--version"]
