#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { makeBangCommand } from "./command.ts";

const command = makeBangCommand(process.cwd());
const program = Command.run(command, { version: "0.0.0" });

// @effect-diagnostics-next-line strictEffectProvide:off
BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
