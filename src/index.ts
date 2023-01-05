import path from "path";
import { Plugin, OutputChunk, OutputAsset, PluginContext, NormalizedOutputOptions } from "rollup";
import { createFilter } from "@rollup/pluginutils";
import cssnano from "cssnano";
import { LoaderContext, Extracted } from "./loaders/types";
import { ExtractedData, Options, PostCSSLoaderOptions } from "./types";
import Loaders from "./loaders";
import { humanlizePath, normalizePath, isAbsolutePath, isRelativePath } from "./utils/path";
import { mm } from "./utils/sourcemap";
import concat from "./utils/concat";
import {
  inferOption,
  inferModeOption,
  inferSourceMapOption,
  inferHandlerOption,
  ensureUseOption,
  ensurePCSSOption,
  ensurePCSSPlugins,
} from "./utils/options";

export default (options: Options = {}): Plugin => {
  const isIncluded = createFilter(options.include, options.exclude);

  const sourceMap = inferSourceMapOption(options.sourceMap);

  const loaderOpts: PostCSSLoaderOptions = {
    ...inferModeOption(options.mode),

    minimize: inferOption(options.minimize, false),
    config: inferOption(options.config, {}),
    import: inferHandlerOption(options.import, options.alias),
    url: inferHandlerOption(options.url, options.alias),
    modules: inferOption(options.modules, false),

    to: options.to,
    dts: options.dts ?? false,
    namedExports: options.namedExports ?? false,
    autoModules: options.autoModules ?? true,
    extensions: options.extensions ?? [".css", ".scss", ".pcss", ".postcss", ".sss"],
    postcss: {},
  };

  if (
    typeof loaderOpts.inject === "object" &&
    loaderOpts.inject.treeshakeable &&
    loaderOpts.namedExports
  )
    throw new Error("`inject.treeshakeable` option is incompatible with `namedExports` option");

  if (options.parser) loaderOpts.postcss.parser = ensurePCSSOption(options.parser, "parser");

  if (options.syntax) loaderOpts.postcss.syntax = ensurePCSSOption(options.syntax, "syntax");

  if (options.stringifier)
    loaderOpts.postcss.stringifier = ensurePCSSOption(options.stringifier, "stringifier");

  if (options.plugins) loaderOpts.postcss.plugins = ensurePCSSPlugins(options.plugins);

  const loaders = new Loaders({
    use: [["postcss", loaderOpts], ...ensureUseOption(options), ["sourcemap", {}]],
    loaders: options.loaders,
    extensions: loaderOpts.extensions,
  });

  let extracted: Extracted[] = [];

  const plugin: Plugin = {
    name: "styles",

    async transform(code, id) {
      if (!isIncluded(id) || !loaders.isSupported(id)) return null;

      // Skip empty files
      if (code.replace(/\s/g, "") === "") return null;

      // Check if file was already processed into JS
      // by other instance(s) of this or other plugin(s)
      try {
        this.parse(code, {}); // If it doesn't throw...
        this.warn(`Skipping processed file ${humanlizePath(id)}`);
        return null;
      } catch {
        // Was not already processed, continuing
      }

      if (typeof options.onImport === "function") options.onImport(code, id);

      const ctx: LoaderContext = {
        id,
        sourceMap,
        deps: new Set(),
        assets: new Map<string, Uint8Array>(),
        warn: this.warn.bind(this),
        plugin: this,
        options: {},
      };

      const res = await loaders.process({ code }, ctx);

      for (const dep of ctx.deps) this.addWatchFile(dep);

      for (const [fileName, source] of ctx.assets) {
        this.emitFile({ type: "asset", fileName, source });
      }

      if (res.extracted) {
        const { id } = res.extracted;
        extracted = extracted.filter(e => e.id !== id);
        extracted.push(res.extracted);
      }

      return {
        code: res.code,
        map: sourceMap && res.map ? res.map : { mappings: "" as const },
        moduleSideEffects: res.extracted ? true : null,
      };
    },

    augmentChunkHash(chunk) {
      if (extracted.length === 0) return;

      const ids: string[] = [];
      for (const module of Object.keys(chunk.modules)) {
        const traversed: Set<string> = new Set();
        let current = [module];
        do {
          const imports: string[] = [];
          for (const id of current) {
            if (traversed.has(id)) continue;
            if (loaders.isSupported(id)) {
              if (isIncluded(id)) imports.push(id);
              continue;
            }
            traversed.add(id);
            const i = this.getModuleInfo(id);
            i && imports.push(...i.importedIds);
          }
          current = imports;
        } while (current.some(id => !loaders.isSupported(id)));
        ids.push(...current);
      }

      const hashable = extracted
        .filter(e => ids.includes(e.id))
        .sort((a, b) => ids.lastIndexOf(a.id) - ids.lastIndexOf(b.id))
        .map(e => `${path.basename(e.id)}:${e.css}`);

      if (hashable.length === 0) return;

      return hashable.join(":");
    },

    async generateBundle(opts, bundle) {
      if (extracted.length === 0 || !(opts.dir || opts.file)) return;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- either `file` or `dir` are always present
      const dir = opts.dir ?? path.dirname(opts.file!);
      const chunks = Object.values(bundle).filter((c): c is OutputChunk => c.type === "chunk");
      const manual = chunks.filter(c => !c.facadeModuleId);

      // 是否保留样式引入
      const preserveStyleModules = !!options.preserveStyleModules && opts.preserveModules && (!options.mode || options.mode === 'extract');

      const emitted = opts.preserveModules
        ? chunks
        : chunks.filter(c => c.isEntry || c.isDynamicEntry);

      let emittedList: EmittedItem[] = [];

      const getExtractedData = async (name: string, ids: string[]): Promise<ExtractedData> => {
        const fileName =
          typeof loaderOpts.extract === "string"
            ? normalizePath(loaderOpts.extract).replace(/^\.[/\\]/, "")
            : normalizePath(`${name}.css`);

        if (isAbsolutePath(fileName))
          this.error(
            [
              "Extraction path must be relative to the output directory,",
              `which is ${humanlizePath(dir)}`,
            ].join("\n"),
          );

        if (isRelativePath(fileName))
          this.error(
            [
              "Extraction path must be nested inside output directory,",
              `which is ${humanlizePath(dir)}`,
            ].join("\n"),
          );

        const entries = extracted
          .filter(e => ids.includes(e.id))
          .sort((a, b) => ids.lastIndexOf(a.id) - ids.lastIndexOf(b.id));

        const res = await concat(entries);

        return {
          name: fileName,
          css: res.css,
          map: mm(res.map.toString())
            .relative(path.dirname(path.resolve(dir, fileName)))
            .toString(),
        };
      };

      const getName = (chunk: OutputChunk): string => {
        if (opts.file) return path.parse(opts.file).name;
        if (opts.preserveModules) {
          const { dir, name } = path.parse(chunk.fileName);
          return dir ? `${dir}/${name}` : name;
        }
        return chunk.name;
      };

      // get out dir from OutputChunk
      // TODO find a perfect way
      const getDir = (chunk: OutputChunk): string => {
        const moduleId = chunk.facadeModuleId
        if (moduleId) {

          let fileName = chunk.fileName;
          // const fileNameWithoutExt = fileName.replace(/\.\d+$/, '');
          for (const extension of loaderOpts.extensions) {
            const reg = new RegExp(`${extension.replace('.', '\\.')}.js$`);
            if (reg.test(fileName)) {
              fileName = fileName.replace(reg, extension);
              break;
            }
          }

          return moduleId.replace(/\.(ts|tsx|jsx|es6|es|mjs)$/, '.js').replace(`/${fileName}`, '')
        }
        return path.resolve(process.cwd(), 'src');
      };

      const getImports = (chunk: OutputChunk): string[] => {
        const ids: string[] = [];
        for (const module of Object.keys(chunk.modules)) {
          const traversed: Set<string> = new Set();
          let current = [module];
          do {
            const imports: string[] = [];
            for (const id of current) {
              if (traversed.has(id)) continue;
              if (loaders.isSupported(id)) {
                if (isIncluded(id)) imports.push(id);
                continue;
              }
              traversed.add(id);
              const i = this.getModuleInfo(id);
              i && imports.push(...i.importedIds);
            }
            current = imports;
          } while (current.some(id => !loaders.isSupported(id)));
          ids.push(...current);
        }

        return ids;
      };

      const moved: string[] = [];
      if (typeof loaderOpts.extract === "string") {
        const ids: string[] = [];

        for (const chunk of manual) {
          const chunkIds = getImports(chunk);
          moved.push(...chunkIds);
          ids.push(...chunkIds);
        }

        for (const chunk of emitted)
          ids.push(...getImports(chunk).filter(id => !moved.includes(id)));

        const name = getName(chunks[0]);
        const dir = getDir(chunks[0]);
        emittedList.push([name, ids, dir]);
      } else {
        for (const chunk of manual) {
          const ids = getImports(chunk);
          if (ids.length === 0) continue;
          moved.push(...ids);
          const name = getName(chunk);
          const dir = getDir(chunk);
          emittedList.push([name, ids, dir]);
        }

        for (const chunk of emitted) {
          const ids = getImports(chunk).filter(id => !moved.includes(id));
          if (ids.length === 0) continue;
          const name = getName(chunk);
          const dir = getDir(chunk);
          emittedList.push([name, ids, dir]);
        }
      }

      if (preserveStyleModules) {
        emittedList = extractEmittedList(emittedList, loaderOpts.extensions);
        writeStylesImportsForChunk({
          outputOpts: opts,
          chunks,
          pluginContext: this,
          loaders,
          emittedList,
        });
      }

      for await (const [name, ids] of emittedList) {
        const res = await getExtractedData(name, ids);

        if (typeof options.onExtract === "function") {
          const shouldExtract = options.onExtract(res);
          if (!shouldExtract) continue;
        }

        // Perform minimization on the extracted file
        if (loaderOpts.minimize) {
          const cssnanoOpts = typeof loaderOpts.minimize === "object" ? loaderOpts.minimize : {};
          const minifier = cssnano(cssnanoOpts);

          const resMin = await minifier.process(res.css, {
            from: res.name,
            to: res.name,
            map: sourceMap && {
              inline: false,
              annotation: false,
              sourcesContent: sourceMap.content,
              prev: res.map,
            },
          });

          res.css = resMin.css;
          res.map = resMin.map?.toString();
        }

        const cssFile = {
          type: "asset" as const,
          fileName: res.name,
          name: res.name,
          source: res.css
        };

        const cssFileId = this.emitFile(cssFile);

        if (res.map && sourceMap) {
          const fileName = this.getFileName(cssFileId);

          const assetDir =
            typeof opts.assetFileNames === "string"
              ? normalizePath(path.dirname(opts.assetFileNames))
              : typeof opts.assetFileNames === "function"
                ? normalizePath(path.dirname(opts.assetFileNames(cssFile)))
                : "assets"; // Default for Rollup v2

          const map = mm(res.map)
            .modify(m => (m.file = path.basename(fileName)))
            .modifySources(s => {
              // Compensate for possible nesting depending on `assetFileNames` value
              if (s === "<no source>") return s;
              if (assetDir.length <= 1) return s;
              s = `../${s}`; // ...then there's definitely at least 1 level offset
              for (const c of assetDir) if (c === "/") s = `../${s}`;
              return s;
            });

          if (sourceMap.inline) {
            map.modify(m => sourceMap.transform?.(m, normalizePath(dir, fileName)));
            (bundle[fileName] as OutputAsset).source += map.toCommentData();
          } else {
            const mapFileName = `${fileName}.map`;
            map.modify(m => sourceMap.transform?.(m, normalizePath(dir, mapFileName)));
            this.emitFile({ type: "asset", fileName: mapFileName, source: map.toString() });
            const { base } = path.parse(mapFileName);
            (bundle[fileName] as OutputAsset).source += map.toCommentFile(base);
          }
        }
      }
    },
  };

  return plugin;
};

// [name, [id], dir]
type EmittedItem = [string, string[], string];

/**
 * 按照单个css文件维度提取EmittedList
 */
function extractEmittedList(emittedList: EmittedItem[], extensions: string[]): EmittedItem[] {

  const list: EmittedItem[] = [];

  for (const emittedItem of emittedList.reverse()) {
    const [, ids, dir] = emittedItem;
    for (const id of ids) {
      let name = id.replace(`${dir}/`, '');

      // 去掉node_modules的绝对路径
      name = name.replace(/.*?\/node_modules/, 'node_modules');

      // 去掉后缀
      for (const extension of extensions) {
        const reg = new RegExp(`${extension.replace('.', '\\.')}$`);
        if (reg.test(name)) {
          name = name.replace(reg, '');
          break;
        }
      };
      if (list.some(item => item[0] === name)) continue;
      list.push([name, [id], dir]);
    }
  }

  return list;
}

// 写入样式引入语句到chunk
function writeStylesImportsForChunk(opts: {
  outputOpts: NormalizedOutputOptions;
  chunks: OutputChunk[]
  pluginContext: PluginContext;
  loaders: Loaders;
  emittedList: EmittedItem[];
}) {
  const { chunks, pluginContext, loaders, emittedList, outputOpts } = opts

  const { format } = outputOpts;

  const isEsOutput = ['es', 'esm', 'module'].includes(format);
  const isCjsOutput = ['cjs', 'commonjs'].includes(format);

  if (!isEsOutput && !isCjsOutput) return;

  // 样式源文件与生成的样式文件映射
  const emittedMap: Record<string, string> = {};
  for (const emittedItem of emittedList) {
    const [ emittedName, [ emittedId ] ] = emittedItem;
    emittedMap[emittedId] = emittedName
  }

  for (const chunk of chunks) {
    const moduleId = chunk.facadeModuleId;
    if (!moduleId) continue;
    const moduleInfo = pluginContext.getModuleInfo(moduleId);
    if (!moduleInfo) continue;

    // 找到每个chunk引入的css文件
    const styleImporters = moduleInfo.importedIds.filter(id => loaders.isSupported(id));
    if (styleImporters.length === 0) continue;


    for (const importedId of styleImporters.reverse()) {
      const styleName = emittedMap[importedId];
      if (!styleName) continue;
      // 如果有对应生成样式，则写入import语句
      let importString = `require('./${path.relative(path.dirname(chunk.fileName), styleName)}.css');`
      if (isEsOutput) {
        importString = `import './${path.relative(path.dirname(chunk.fileName), styleName)}.css';`;
      }
      chunk.code = `${importString}\n${chunk.code}`;
    }
  }
  
}
