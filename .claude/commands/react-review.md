Review all changed files for React pitfalls that cause production crashes. Run `git diff --name-only HEAD` to find changed files, then read each .tsx/.ts file and check for:

1. **Infinite re-render loops**: useCallback/useMemo with dependencies that are objects, arrays, or functions created during render (these are new references every render). Flag any useCallback whose dependency array includes a prop that is an array or object — the parent must memoize it or the component must use a ref.

2. **Unstable useEffect dependencies**: useEffect that depends on a useCallback, which itself depends on state that changes inside the effect. This creates: state changes -> callback recreated -> effect re-fires -> state changes -> infinite loop.

3. **Missing dependency array**: Any useEffect or useCallback with `// eslint-disable-line` or `// eslint-disable-next-line` comments suppressing exhaustive-deps. These are time bombs. Flag each one and explain what the correct fix is.

4. **Object/array literals in JSX props**: Components receiving `style={{...}}` or `data={[...]}` as props — if that child uses React.memo or has useEffect depending on those props, it will re-render every time.

5. **State updates during render**: Any setState call that is not inside a useEffect, useCallback, or event handler. Direct setState during render causes infinite loops.

6. **Ref pattern check**: When a callback prop is used inside useEffect, it should be stored in a ref (like `onSaveStageRef` pattern in BatchProcessor.tsx). Flag cases where callback props are used directly in useEffect dependency arrays.

After the review, run `npm run check` (typecheck + lint). Report all findings with file paths and line numbers.
