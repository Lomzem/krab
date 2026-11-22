# shadcn-svelte attribution

The bait search in the gear sheet uses four Command wrappers adapted from [shadcn-svelte](https://github.com/huntabyte/shadcn-svelte) at commit [`c3b21a62055c7d7b97a220eb5a9efb4d1b7fc8fc`](https://github.com/huntabyte/shadcn-svelte/tree/c3b21a62055c7d7b97a220eb5a9efb4d1b7fc8fc/docs/src/lib/registry/ui/command): `command.svelte`, `command-input.svelte`, `command-list.svelte` and `command-item.svelte`. The copies live in `src/lib/features/on-water/bait-command/` and build on [`bits-ui` 2.21.0](https://www.npmjs.com/package/bits-ui/v/2.21.0).

Krab changed the copies:

- Krab tokens and focus classes replace the stock styles, and Svelte class arrays replace the `cn` helper.
- The input wrapper is a plain input with no input group or search icon. It points `aria-controls` at the list and drops its popup attributes while no list shows.
- The root renders as a group instead of an application, and handles keys only from the search input, leaving Home and End to the caret.
- The list always wraps its items in the Command viewport.
- The item shows Krab's check icon for the saved choice.
- Comments and lint directives are removed.

The upstream licence:

```text
MIT License

Copyright (c) 2023 Hunter Johnston <https://github.com/huntabyte>
Copyright (c) 2023 CokaKoala <https://github.com/adriangonz97>
Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
