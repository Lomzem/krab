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

const valueAt = (node: YamlNode, key: string) =>
  pairsOf(node).find((pair) => keyOf(pair) === key) ?? null;

const checkJob = (context: Rule.RuleContext, job: AST.YAMLPair) => {
  const name = keyOf(job);
  const data = {
    job: typeof name === 'string' ? name : 'unnamed',
    minutes: String(CI_MINUTES)
  };
  const timeout = valueAt(job.value, 'timeout-minutes')?.value ?? null;
  const minutes = timeout === null ? null : getStaticYAMLValue(timeout);
  if (typeof minutes !== 'number' || minutes > CI_MINUTES)
    context.report({ loc: job.loc, messageId: 'timeout', data });
  const waits = [
    valueAt(job.value, 'needs'),
    valueAt(job.value, 'concurrency'),
    valueAt(valueAt(job.value, 'strategy')?.value ?? null, 'max-parallel')
  ];
  for (const wait of waits)
    if (wait !== null)
      context.report({ loc: wait.loc, messageId: 'needs', data });
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
          valueAt(document.content, 'jobs')?.value ?? null
        ))
          checkJob(context, job);
    }
  })
};
