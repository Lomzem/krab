#!/usr/bin/env bun
import type { Page, TestInfo } from '@playwright/test';
import { appendFileSync, writeFileSync } from 'node:fs';
import type { Trip } from '../../src/lib/features/trip/types';

export const readTrips = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Trip[]>((resolve, reject) => {
        const request = indexedDB.open('krab');
        request.onupgradeneeded = () => {
          request.transaction?.abort();
        };
        request.onerror = () => {
          reject(new Error('Cannot read Krab IndexedDB'));
        };
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('trips')) {
            db.close();
            reject(new Error('Krab IndexedDB has no trips store'));
            return;
          }
          const read = db
            .transaction('trips', 'readonly')
            .objectStore('trips')
            .getAll();
          read.onsuccess = () => {
            resolve(read.result as Trip[]);
            db.close();
          };
          read.onerror = () => {
            reject(new Error('Cannot read trips'));
            db.close();
          };
        };
      })
  );

export const recorder = (
  page: Page,
  info: TestInfo,
  feature: string,
  entry: string
) => ({
  log: (action: string) => {
    appendFileSync(
      info.outputPath('actions.jsonl'),
      JSON.stringify({
        at: new Date().toISOString(),
        feature,
        entry,
        action
      }) + '\n'
    );
  },
  capture: async (name: string) => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.screenshot({
      path: info.outputPath(`${name}.png`),
      animations: 'disabled'
    });
    writeFileSync(
      info.outputPath(`${name}.state.json`),
      JSON.stringify(
        {
          feature,
          entry,
          state: name,
          project: info.project.name,
          browser: page.context().browser()?.version(),
          viewport: page.viewportSize(),
          rendering: await page.evaluate(() => ({
            dark: matchMedia('(prefers-color-scheme: dark)').matches,
            pixelRatio: devicePixelRatio,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth
          }))
        },
        null,
        2
      )
    );
    writeFileSync(
      info.outputPath(`${name}.aria.txt`),
      await page.locator('body').ariaSnapshot()
    );
  },
  keep: (name: string, value: unknown) => {
    writeFileSync(info.outputPath(name), JSON.stringify(value, null, 2));
  }
});
