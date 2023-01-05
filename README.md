# rollup-plugin-lib-styles

[![npm version](https://img.shields.io/npm/v/rollup-plugin-lib-styles)](https://www.npmjs.com/package/rollup-plugin-lib-styles)
[![required rollup version](https://img.shields.io/npm/dependency-version/rollup-plugin-lib-styles/peer/rollup)](https://www.npmjs.com/package/rollup)
<!-- [![monthly downloads count](https://img.shields.io/npm/dm/rollup-plugin-lib-styles)](https://www.npmjs.com/package/rollup-plugin-lib-styles) -->
<!-- [![build status](https://github.com/mlxiao93/rollup-plugin-lib-styles/workflows/CI/badge.svg)](https://github.com/mlxiao93/rollup-plugin-lib-styles/actions?query=workflow%3ACI) -->
<!-- [![code coverage](https://codecov.io/gh/mlxiao93/rollup-plugin-lib-styles/branch/main/graph/badge.svg)](https://codecov.io/gh/mlxiao93/rollup-plugin-lib-styles)
[![license](https://img.shields.io/github/license/mlxiao93/rollup-plugin-lib-styles)](./LICENSE) -->
<!-- [![financial contributors](https://opencollective.com/rollup-plugin-lib-styles/tiers/badge.svg)](https://opencollective.com/rollup-plugin-lib-styles) -->

**🎨 Universal [Rollup](https://github.com/rollup/rollup) plugin for styles**

- [PostCSS](https://github.com/postcss/postcss)
- [CSS Modules](https://github.com/css-modules/css-modules)
- [Sass](https://github.com/sass/dart-sass) / [Less](https://github.com/less/less.js) / [Stylus](https://github.com/stylus/stylus)
- Complete code splitting support, with respect for multiple entries, preserveModules and manualChunks

...and more!

## Table of Contents

- [Usage](#usage)
  - [CSS Extraction](#css-extraction)
  - [CSS Injection](#css-injection)
  - [preserveStyleModules](#preservestylemodules)
  - [CSS Modules](#css-modules)
  - [PostCSS](#postcss)
  - [Emitting processed CSS](#emitting-processed-css);
  - [With Sass/Less/Stylus](#with-sasslessstylus)
- [Configuration](#configuration)
- [Why](#why)
- [License](#license)
- [Thanks](#thanks)

## Usage

```bash
# npm
npm install -D rollup-plugin-lib-styles
# pnpm
pnpm add -D rollup-plugin-lib-styles
# yarn
yarn add rollup-plugin-lib-styles --dev
```

```js
// rollup.config.js
import styles from "rollup-plugin-lib-styles";

export default {
  plugins: [styles()],
};
```

### CSS Extraction

```js
styles({
  mode: "extract", // Unnecessary, set by default
  // ... or with relative to output dir/output file's basedir (but not outside of it)
  mode: ["extract", "awesome-bundle.css"],
});
```

### CSS Injection

```js
styles({
  mode: "inject",
  // ...or with custom options for injector
  mode: [
    "inject",
    { container: "body", singleTag: true, prepend: true, attributes: { id: "global" } },
  ],
  // ...or with custom injector
  mode: ["inject", (varname, id) => `console.log(${varname},${JSON.stringify(id)})`],
});
```

### preserveStyleModules

```js
export default {
  output: {
    dir: 'es', 
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
  },
  plugins: [styles({
    preserveStyleModules: true,
  })],
};
```

`preserveStyleModules` （ 仅当`output.preserveModules 为 true` 时生效）

- `true`: 只转换样式文件，不进行合并，同时会在引入样式文件的js模块保留保留引入语句。
- `false`: 会将每个js模块引入的所有样式文件合并成一个文件。

### [CSS Modules](https://github.com/css-modules/css-modules)

```js
styles({
  modules: true,
  // ...or with custom options
  modules: {
    generateScopedName: '[dir]_[name]_[local]_[hash:6]'
  },
  // ...additionally using autoModules
  autoModules: true, // set by default
  // ...with custom regex
  autoModules: /\.mod\.\S+$/,
  // ...or custom function
  autoModules: id => id.includes(".modular."),
});
```

### PostCSS

#### Use config file

```js
// postcss.config.js
module.exports = {
  plugins: [
    require('autoprefixer')
  ]
}
```

PostCSS configuration files will be found and loaded automatically, but this behavior is configurable using config option.

#### PostCSS config in plugin call

```js
import autoprefixer from 'autoprefixer';

styles({
  plugins: [
    autoprefixer(),
  ],
})
```

### Emitting processed CSS

```js
// rollup.config.js
import styles from "rollup-plugin-lib-styles";

// Any plugin which consumes pure CSS
import litcss from "rollup-plugin-lit-css";

export default {
  plugins: [
    styles({ mode: "emit" }),

    // Make sure to list it after this one
    litcss(),
  ],
};
```

### With Sass/Less/Stylus

Install corresponding dependency:

- For `Sass` support install `sass` or `node-sass`:

  ```bash
  # npm
  npm install -D sass
  # pnpm
  pnpm add -D sass
  # yarn
  yarn add sass --dev
  ```

  ```bash
  # npm
  npm install -D node-sass
  # pnpm
  pnpm add -D node-sass
  # yarn
  yarn add node-sass --dev
  ```

- For `Less` support install `less`:

  ```bash
  # npm
  npm install -D less
  # pnpm
  pnpm add -D less
  # yarn
  yarn add less --dev
  ```

- For `Stylus` support install `stylus`:

  ```bash
  # npm
  npm install -D stylus
  # pnpm
  pnpm add -D stylus
  # yarn
  yarn add stylus --dev
  ```

That's it, now you can import `.scss` `.sass` `.less` `.styl` `.stylus` files in your code.

## Configuration

See [API Reference for `Options`](https://mlxiao93.github.io/rollup-plugin-lib-styles/interfaces/types.Options.html) for full list of available options.

## Why

完整继承了[rollup-plugin-styles](https://github.com/Anidetrix/rollup-plugin-styles)的所有功能。

并做了下列改进：

- 支持 rollup@3x
- 修复了 preserveModules + extract 模式下生成的 css 文件被去重的问题。
- 新增 preserveStyleModules 选项，可以只转换css，不做合并，并且保留 css 文件的引入语句。
- 修复了 module 选项覆盖 autoModule 的问题。
- 修改了一些默认选项，更符合使用习惯。
  - `mode: extract`
  - `autoModule: true`

## License

MIT &copy; [MaoLin Xiao](https://github.com/mlxiao93)

## Thanks

- [rollup-plugin-styles](https://github.com/Anidetrix/rollup-plugin-styles) - for good reference 👍
- [rollup-plugin-postcss](https://github.com/egoist/rollup-plugin-postcss) - for good reference 👍
- [rollup](https://github.com/rollup/rollup) - for awesome bundler 😎
