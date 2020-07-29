import { DEngine, DNodeUtils, Note } from "@dendronhq/common-all";
import fs from "fs-extra";
import matter from "gray-matter";
import _ from "lodash";
import path from "path";
import { BaseCommand } from "./base";

type CommandOpts = {
  engine: DEngine;
} & CommandCommonOpts;

type CommandCommonOpts = {
  /**
   * Where is site
   */
  siteRoot: string;
};

type CommandOutput = void;

type DendronSiteConfig = {
  root: string;
};

type DendronJekyllProps = {
  hpath: string;
  permalink?: string;
};

function wikiLinkToMd(note: Note, engine: DEngine) {
  let matches;
  let doc = note.body;
  do {
    matches = doc.match(/(?<raw>\[\[(?<link>[^\]]+)\]\])/);
    if (matches) {
      // @ts-ignore
      const { raw, link } = matches.groups;
      const [first, rest] = link.split("|");
      let title: string;
      let mdLink: string;
      // we have a piped title
      if (rest) {
        title = _.trim(first);
        mdLink = _.trim(rest);
      } else {
        title = _.trim(note.title);
        mdLink = _.trim(first);
      }
      const noteFromLink = _.find(engine.notes, { fname: mdLink });
      if (!noteFromLink) {
        throw Error(`${mdLink} not found. file: ${note.fname}`);
      }
      const newLink = `[${title}](${noteFromLink.id})`;
      doc = doc.replace(raw, newLink);
    }
  } while (matches);
  return doc;
}

function note2JekyllMdFile(
  note: Note,
  opts: { notesDir: string; engine: DEngine } & DendronSiteConfig
) {
  const meta = DNodeUtils.getMeta(note, { pullCustomUp: true });
  const jekyllProps: DendronJekyllProps = {
    hpath: note.path,
  };
  if (opts.root === meta.fname) {
    jekyllProps["permalink"] = "/";
  }
  // pull children of root to the top
  if (note.parent?.fname === opts.root) {
    delete meta["parent"];
  }
  note.body = wikiLinkToMd(note, opts.engine);
  const filePath = path.join(opts.notesDir, meta.id + ".md");
  return fs.writeFile(
    filePath,
    matter.stringify(note.body || "", { ...meta, ...jekyllProps })
  );
}

export class BuildSiteCommand extends BaseCommand<CommandOpts, CommandOutput> {
  async execute(opts: CommandOpts) {
    const { engine, siteRoot } = _.defaults(opts, {});
    const notesDir = "notes";
    const notesDirPath = path.join(siteRoot, notesDir);
    const L = this.L.child({ ctx: "BuildSiteComman", siteRoot });
    fs.ensureDirSync(notesDirPath);
    // TODO: ask for confirmation
    fs.emptyDirSync(notesDirPath);
    const config: DendronSiteConfig = {
      root: "dendron",
    };
    const root: Note = _.find(engine.notes, { fname: config.root }) as Note;
    if (_.isUndefined(root)) {
      throw Error(`root ${root} not found`);
    }
    const nodes: Note[] = [root];
    const out = [];
    while (!_.isEmpty(nodes)) {
      const node = nodes.pop() as Note;
      out.push(
        note2JekyllMdFile(node, { notesDir: notesDirPath, engine, ...config })
      );
      node.children.forEach((n) => nodes.push(n as Note));
    }
    // TODO: need to rewrite links before this is ready
    // const assetsDir = "assets";
    // const noteAssetsDir = path.join(notesDirPath, assetsDir);
    // const siteAssetsDir = path.join(siteRoot, assetsDir);
    // const vaultAssetsDir = path.join(engine.props.root, assetsDir);

    // const copyP = new Promise((resolve, reject) => {
    //   fs.copy(
    //     path.join(vaultAssetsDir, "images"),
    //     path.join(siteAssetsDir, "images"),
    //     err => {
    //       if (err) reject(err);
    //       L.info({ msg: "finish copying" });
    //       resolve();
    //     }
    //   );
    // });
    await Promise.all(nodes);
    // await copyP;
    L.info({ msg: "exit" });
    return;
  }
}

export type BuildSiteCliOpts = {
  vault: string;
} & CommandCommonOpts;

// rm -r site-builder/docs 2>/dev/null || true
// mkdir site-builder/docs
// echo "copying files..."
// cp vault/* site-builder/docs