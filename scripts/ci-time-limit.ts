import type { Rule } from 'eslint';
import { getStaticYAMLValue, type AST } from 'yaml-eslint-parser';

const CI_MINUTES = 5;
const SPLIT = 'Split the work into more parallel jobs or shards.';

type YamlNode = AST.YAMLContent | AST.YAMLWithMeta | null;

const pairsOf = (node: YamlNode): AST.YAMLPair[] => {
  const content = node?.type === 'YAMLWithMeta' ? node.value : node;
  return content?.type === 'YAMLMapping' ? content.pairs : [];
};

const keyOf = (pair: AST.YAMLPair) =>
  pair.key === null ? null : getStaticYAMLValue(pair.key);

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;

const checkJob = (context: Rule.RuleContext, job: AST.YAMLPair) => {
  const name = keyOf(job);
  const data = {
    job: typeof name === 'string' ? name : 'unnamed',
    minutes: String(CI_MINUTES)
  };
  const settings = job.value === null ? null : getStaticYAMLValue(job.value);
  const minutes = fieldOf(settings, 'timeout-minutes');
  if (typeof minutes !== 'number' || minutes > CI_MINUTES)
    context.report({ loc: job.loc, messageId: 'timeout', data });
  const waits = [
    fieldOf(settings, 'needs'),
    fieldOf(settings, 'concurrency'),
    fieldOf(fieldOf(settings, 'strategy'), 'max-parallel')
  ];
  if (waits.some((wait) => wait !== undefined))
    context.report({ loc: job.loc, messageId: 'needs', data });
};

export const ciTimeLimit: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      timeout: `Job {{job}} must set timeout-minutes to at most {{minutes}}, because CI must finish within {{minutes}} minutes. ${SPLIT}`,
      needs: `Job {{job}} waits for another job, so CI could take longer than {{minutes}} minutes. Start every job at once. ${SPLIT}`
    }
  },
  create: (context) => ({
    Program(node) {
      const program = node as unknown as AST.YAMLProgram;
      for (const document of program.body)
        for (const job of pairsOf(
          pairsOf(document.content).find((pair) => keyOf(pair) === 'jobs')
            ?.value ?? null
        ))
          checkJob(context, job);
    }
  })
};
