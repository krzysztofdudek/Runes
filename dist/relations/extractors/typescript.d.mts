import type { DependencyExtractor } from './types.mjs';
export declare const typescriptExtractor: DependencyExtractor;
/** The script view of a single-file component the relation pass parses in place of its raw bytes. */
export interface SfcScriptView {
    /** Extractor language of the script blocks: `typescript`, `tsx` or `javascript`. */
    language: string;
    /** Path handed to the parser — the component's own path plus the grammar's extension. */
    parsePath: string;
    /** The component with every byte outside its `<script>` bodies blanked (newlines kept). */
    content: string;
}
/**
 * Vue and Svelte single-file components carry their imports in `<script>` blocks
 * (`<script>`, `<script setup lang="ts">`, `<script context="module">`). No shipped
 * grammar parses a whole component, so the relation pass parses a VIEW of it: every
 * byte outside a script body becomes a space (newlines are kept, so every line
 * number is the component's own), and the view is parsed with the TS, TSX or JS
 * grammar the blocks' `lang` names (`ts`/`typescript` → TS, `tsx` → TSX, otherwise
 * JS). Returns null for any other file, or a component with no script block.
 */
export declare function sfcScriptView(filePath: string, content: string): SfcScriptView | null;
