/** Offline dashboard pagination regressions; evaluate actual slicing and navigation handlers. */
/* eslint-disable @typescript-eslint/no-require-imports -- Native Node CommonJS test entry. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const filename = path.join(__dirname, '../src/app/(app)/dashboard/page.tsx');
const source = fs.readFileSync(filename, 'utf8');
const tree = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const names = ['itemsPerPage', 'totalPages', 'activePage', 'paginatedHistory', 'pageWindowStart', 'visiblePages'];
const declarations = new Map();
let navigation;
function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && names.includes(node.name.text)) {
    declarations.set(node.name.text, `const ${node.getText(tree)};`);
  }
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === 'nav'
    && node.openingElement.attributes.properties.some(attribute => ts.isJsxAttribute(attribute)
      && attribute.name.getText(tree) === 'aria-label' && attribute.initializer?.getText(tree) === '"음원 목록 페이지"')) {
    let expression = node;
    while (expression.parent && !ts.isJsxExpression(expression.parent)) expression = expression.parent;
    navigation = expression.getText(tree);
  }
  ts.forEachChild(node, visit);
}
visit(tree);
for (const name of names) assert.ok(declarations.has(name), `Missing real dashboard declaration: ${name}`);
assert.ok(navigation, 'Dashboard needs a named pagination navigation');

const jsx = (type, props) => ({ type, props });
function evaluate(filtered, currentPage, renderNavigation = false) {
  const output = { exports: {} }, selections = [];
  const code = names.map(name => declarations.get(name)).join('\n')
    + '\nexports.state = { itemsPerPage, totalPages, activePage, paginatedHistory, visiblePages };'
    + (renderNavigation ? `\nexports.navigation = ${navigation};` : '');
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, {
    exports: output.exports, filtered, currentPage,
    require(name) {
      assert.equal(name, 'react/jsx-runtime');
      return { jsx, jsxs: jsx };
    },
    ChevronLeft: 'ChevronLeft', ChevronRight: 'ChevronRight',
    setCurrentPage: value => selections.push(value),
    fetch() { throw Error('External network is forbidden'); },
  });
  return { ...output.exports, selections };
}
const rows = count => Array.from({ length: count }, (_, id) => ({ id }));
function nodes(value, predicate) {
  if (Array.isArray(value)) return value.flatMap(child => nodes(child, predicate));
  if (!value || typeof value !== 'object') return [];
  return [...(predicate(value) ? [value] : []), ...nodes(value.props?.children, predicate)];
}
function text(value) {
  if (Array.isArray(value)) return value.map(text).join('');
  return value && typeof value === 'object' ? text(value.props?.children) : String(value ?? '');
}

test('zero, exact-page and overflow boundaries use 20 songs with no loss or duplication', () => {
  for (const count of [0, 20, 21, 40, 41, 173]) {
    const input = rows(count), pageCount = Math.max(1, Math.ceil(count / 20)), seen = [];
    for (let page = 1; page <= pageCount; page++) {
      const { state } = evaluate(input, page);
      assert.equal(state.itemsPerPage, 20);
      assert.equal(state.totalPages, pageCount);
      assert.ok(state.paginatedHistory.length <= 20);
      if (page < pageCount) assert.equal(state.paginatedHistory.length, 20);
      seen.push(...state.paginatedHistory.map(row => row.id));
    }
    assert.deepEqual(seen, input.map(row => row.id));
  }
});

test('a reduced filtered library immediately renders its last valid page before state synchronization', () => {
  const { state } = evaluate(rows(40), 3);
  assert.equal(state.activePage, 2);
  assert.equal(state.totalPages, 2);
  assert.deepEqual(Array.from(state.paginatedHistory, row => row.id), Array.from({ length: 20 }, (_, index) => index + 20));
  assert.equal(evaluate(rows(0), 9).state.activePage, 1);
});

test('page-number windows include the active page and stay within valid boundaries', () => {
  for (const count of [21, 41, 173, 401]) {
    const totalPages = Math.ceil(count / 20);
    for (let page = 1; page <= totalPages; page++) {
      const { visiblePages } = evaluate(rows(count), page).state;
      assert.ok(visiblePages.includes(page));
      assert.ok(visiblePages.every(value => value >= 1 && value <= totalPages));
      assert.equal(visiblePages.length, Math.min(5, totalPages));
      assert.equal(new Set(visiblePages).size, visiblePages.length);
    }
  }
});

test('navigation announces current and total pages and disables previous/next at their boundaries', () => {
  for (const page of [1, 5, 9]) {
    const result = evaluate(rows(173), page, true);
    const buttons = nodes(result.navigation, node => node.type === 'button');
    const previous = buttons.find(button => button.props['aria-label'] === '이전 페이지');
    const next = buttons.find(button => button.props['aria-label'] === '다음 페이지');
    assert.equal(previous.props.disabled, page === 1);
    assert.equal(next.props.disabled, page === 9);
    assert.ok(buttons.every(button => button.props.type === 'button' && button.props['aria-label']));
    const current = buttons.filter(button => button.props['aria-current'] === 'page');
    assert.equal(current.length, 1);
    assert.equal(text(current[0]), String(page));
    const announcement = nodes(result.navigation, node => node.props?.['aria-live'] === 'polite')[0];
    assert.match(text(announcement), /총 173곡/);
    assert.ok(text(announcement).includes(`${page} / 9`));
  }
});

test('actual previous, next and numbered buttons select the expected one-based page', () => {
  const result = evaluate(rows(173), 5, true);
  const buttons = nodes(result.navigation, node => node.type === 'button');
  buttons.find(button => button.props['aria-label'] === '이전 페이지').props.onClick();
  buttons.find(button => button.props['aria-label'] === '다음 페이지').props.onClick();
  buttons.find(button => button.props['aria-label'] === '7 페이지').props.onClick();
  assert.deepEqual(result.selections, [4, 6, 7]);
});

test('one-page libraries omit navigation and a stale last-page button uses the clamped page', () => {
  for (const count of [0, 20]) assert.equal(evaluate(rows(count), 1, true).navigation, false);
  const result = evaluate(rows(40), 3, true);
  const previous = nodes(result.navigation, node => node.props?.['aria-label'] === '이전 페이지')[0];
  previous.props.onClick();
  assert.deepEqual(result.selections, [1]);
});
