// Issue 014: the reference graph of a repository's C# projects. The catalogue holds the cases a reader of source meets (reference/relations/csharp/csharp-*-reference-edge.md, *-unreferenced-*-silence.md); these tests hold the reader itself: what each MSBuild fact does to the closure, and what fails open.
import { describe, it, expect, afterEach } from '../helpers/expect.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildCsharpReachability, listedFileView } from '@chrisdudek/runes/relations';

const PROJECT = '<Project Sdk="Microsoft.NET.Sdk"></Project>';

/** The reachability of `files` (path → text): every `.cs` of the map is a C# file, every other entry a project or props file, read through a listed view. */
function reachOf(files) {
  const view = listedFileView(Object.keys(files), (p) => files[p]);
  const cs = Object.keys(files).filter((p) => p.endsWith('.cs'));
  return buildCsharpReachability('/nowhere', cs, { files: view });
}

/** A project file with the given item lines. */
const withItems = (...items) => `<Project Sdk="Microsoft.NET.Sdk"><ItemGroup>${items.join('')}</ItemGroup></Project>`;
const projectRef = (p) => `<ProjectReference Include="${p}" />`;

describe('buildCsharpReachability — projects and references', () => {
  it('answers same inside one project, reachable through a reference, unreachable otherwise', () => {
    const reach = reachOf({
      'a/A.csproj': withItems(projectRef('../b/B.csproj')),
      'a/x.cs': '', 'a/sub/y.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
      'c/C.csproj': PROJECT, 'c/w.cs': '',
    });
    expect(reach('a/x.cs', 'a/sub/y.cs')).toBe('same');
    expect(reach('a/x.cs', 'b/z.cs')).toBe('reachable');
    expect(reach('b/z.cs', 'a/x.cs')).toBe('unreachable');
    expect(reach('a/x.cs', 'c/w.cs')).toBe('unreachable');
  });

  it('puts several project files of one directory into one project', () => {
    const reach = reachOf({
      'a/A.csproj': withItems(projectRef('../b/B.csproj')),
      'a/A.Other.csproj': PROJECT,
      'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('reachable');
  });

  it('answers unknown for a pair when a file is under no project, or is not one of the files the graph was built for', () => {
    const reach = reachOf({ 'a/A.csproj': PROJECT, 'a/x.cs': '', 'loose/y.cs': '' });
    expect(reach('a/x.cs', 'loose/y.cs')).toBe('unknown');
    expect(reach('loose/y.cs', 'a/x.cs')).toBe('unknown');
    expect(reach('a/x.cs', 'a/unlisted.cs')).toBe('unknown');
  });

  it('follows references through any number of projects and survives a cycle', () => {
    const reach = reachOf({
      'a/A.csproj': withItems(projectRef('../b/B.csproj')), 'a/x.cs': '',
      'b/B.csproj': withItems(projectRef('../c/C.csproj')), 'b/y.cs': '',
      'c/C.csproj': withItems(projectRef('../b/B.csproj')), 'c/z.cs': '',
      'd/D.csproj': PROJECT, 'd/w.cs': '',
    });
    expect(reach('a/x.cs', 'c/z.cs')).toBe('reachable');
    expect(reach('c/z.cs', 'b/y.cs')).toBe('reachable');
    expect(reach('c/z.cs', 'a/x.cs')).toBe('unreachable');
    expect(reach('c/z.cs', 'd/w.cs')).toBe('unreachable');
  });

  it('reads a reference that sits behind a condition, whatever the condition says', () => {
    const reach = reachOf({
      'a/A.csproj': withItems('<ProjectReference Condition="\'$(Never)\' == \'1\'" Include="..\\b\\B.csproj" />'), 'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('reachable');
  });

  it('resolves $(MSBuildProjectDirectory) and $(MSBuildThisFileDirectory) in a path', () => {
    const reach = reachOf({
      'src/a/A.csproj': withItems(projectRef('$(MSBuildProjectDirectory)/../b/B.csproj'), projectRef('$(MSBuildThisFileDirectory)..\\c\\C.csproj')), 'src/a/x.cs': '',
      'src/b/B.csproj': PROJECT, 'src/b/y.cs': '',
      'src/c/C.csproj': PROJECT, 'src/c/z.cs': '',
      'src/d/D.csproj': PROJECT, 'src/d/w.cs': '',
    });
    expect(reach('src/a/x.cs', 'src/b/y.cs')).toBe('reachable');
    expect(reach('src/a/x.cs', 'src/c/z.cs')).toBe('reachable');
    expect(reach('src/a/x.cs', 'src/d/w.cs')).toBe('unreachable');
  });

  it('matches a wildcard reference against the project files of the repository', () => {
    const reach = reachOf({
      'a/A.csproj': withItems(projectRef('..\\libs\\**\\*.csproj')), 'a/x.cs': '',
      'libs/one/One.csproj': PROJECT, 'libs/one/o.cs': '',
      'libs/two/deep/Two.csproj': PROJECT, 'libs/two/deep/t.cs': '',
      'other/Other.csproj': PROJECT, 'other/p.cs': '',
    });
    expect(reach('a/x.cs', 'libs/one/o.cs')).toBe('reachable');
    expect(reach('a/x.cs', 'libs/two/deep/t.cs')).toBe('reachable');
    expect(reach('a/x.cs', 'other/p.cs')).toBe('unreachable');
  });

  it('reads a project as open for a reference to a path of the repository that names no file, and ignores one that lies outside the repository', () => {
    const open = reachOf({
      'a/A.csproj': withItems(projectRef('../gone/Gone.csproj')), 'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(open('a/x.cs', 'b/z.cs')).toBe('unknown');
    const outside = reachOf({
      'a/A.csproj': withItems(projectRef('../../outside/Out.csproj')), 'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(outside('a/x.cs', 'b/z.cs')).toBe('unreachable');
  });

  it('matches a path whose case differs from the file name (a Windows author)', () => {
    const reach = reachOf({
      'a/A.csproj': withItems(projectRef('..\\B\\b.CSPROJ')), 'a/x.cs': '',
      'B/B.csproj': PROJECT, 'B/z.cs': '',
    });
    expect(reach('a/x.cs', 'B/z.cs')).toBe('reachable');
  });

  it('matches every directory of a path in any case, through a listed view and on the disk', () => {
    const files = {
      'src/Billing/Billing.csproj': withItems(projectRef('..\\shared\\Shared.csproj')), 'src/Billing/Invoice.cs': '',
      'src/Shared/Shared.csproj': PROJECT, 'src/Shared/Clock.cs': '',
      'src/Other/Other.csproj': PROJECT, 'src/Other/o.cs': '',
    };
    const reach = reachOf(files);
    expect(reach('src/Billing/Invoice.cs', 'src/Shared/Clock.cs')).toBe('reachable');
    expect(reach('src/Billing/Invoice.cs', 'src/Other/o.cs')).toBe('unreachable');
    const root = mkdtempSync(path.join(os.tmpdir(), 'runes-reach-case-'));
    try {
      for (const [rel, text] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), text, 'utf-8');
      }
      const onDisk = buildCsharpReachability(root, Object.keys(files).filter((p) => p.endsWith('.cs')));
      expect(onDisk('src/Billing/Invoice.cs', 'src/Shared/Clock.cs')).toBe('reachable');
      expect(onDisk('src/Billing/Invoice.cs', 'src/Other/o.cs')).toBe('unreachable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('passes through a project file that holds no C# (an F# project) on the way', () => {
    const reach = reachOf({
      'a/A.csproj': withItems(projectRef('../f/F.fsproj')), 'a/x.cs': '',
      'f/F.fsproj': withItems(projectRef('../b/B.csproj')),
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('reachable');
  });
});

describe('buildCsharpReachability — assemblies and packages', () => {
  it('reads a Reference by its name or by the file name of its HintPath, against the in-repository assembly names', () => {
    const reach = reachOf({
      'f/F.csproj': withItems('<Reference Include="Acme.Core, Version=1.0.0.0, Culture=neutral" />', '<Reference Include="Alias"><HintPath>..\\bin\\Acme.Web.dll</HintPath></Reference>'), 'f/x.cs': '',
      'core/Acme.Core.csproj': PROJECT, 'core/c.cs': '',
      'web/Web.csproj': '<Project><PropertyGroup><AssemblyName>Acme.Web</AssemblyName></PropertyGroup></Project>', 'web/w.cs': '',
      'unrelated/Unrelated.csproj': PROJECT, 'unrelated/u.cs': '',
    });
    expect(reach('f/x.cs', 'core/c.cs')).toBe('reachable');
    expect(reach('f/x.cs', 'web/w.cs')).toBe('reachable');
    expect(reach('f/x.cs', 'unrelated/u.cs')).toBe('unreachable');
  });

  it('gives an external assembly no reach', () => {
    const reach = reachOf({
      'f/F.csproj': withItems('<Reference Include="Newtonsoft.Json"><HintPath>..\\libs\\Newtonsoft.Json.dll</HintPath></Reference>'), 'f/x.cs': '',
      'core/Acme.Core.csproj': PROJECT, 'core/c.cs': '',
    });
    expect(reach('f/x.cs', 'core/c.cs')).toBe('unreachable');
  });

  it('reads an AssemblyName that uses $(MSBuildProjectName), and never one that needs another property', () => {
    const reach = reachOf({
      'f/F.csproj': withItems('<Reference Include="Pre.Core" />', '<Reference Include="Anything" />'), 'f/x.cs': '',
      'core/Core.csproj': '<Project><PropertyGroup><AssemblyName>Pre.$(MSBuildProjectName)</AssemblyName></PropertyGroup></Project>', 'core/c.cs': '',
      'o/O.csproj': '<Project><PropertyGroup><AssemblyName>$(Prefix).Anything</AssemblyName></PropertyGroup></Project>', 'o/o.cs': '',
    });
    expect(reach('f/x.cs', 'core/c.cs')).toBe('reachable');
    expect(reach('f/x.cs', 'o/o.cs')).toBe('unreachable');
  });

  it('reads a PackageReference to the PackageId of an in-repository project', () => {
    const reach = reachOf({
      'f/F.csproj': withItems('<PackageReference Include="Acme.Pack" Version="1.0.0" />', '<PackageReference Include="Serilog" Version="3.0.0" />'), 'f/x.cs': '',
      'core/Core.csproj': '<Project><PropertyGroup><PackageId>Acme.Pack</PackageId></PropertyGroup></Project>', 'core/c.cs': '',
      'serilog/Other.csproj': PROJECT, 'serilog/s.cs': '',
    });
    expect(reach('f/x.cs', 'core/c.cs')).toBe('reachable');
    expect(reach('f/x.cs', 'serilog/s.cs')).toBe('unreachable');
  });

  it('reads a Reference whose Include is the path of the assembly file by its file name', () => {
    const reach = reachOf({
      'f/F.csproj': withItems('<Reference Include="..\\..\\src\\Acme.Api\\bin\\Release\\net8.0\\Acme.Api.dll" />', '<Reference Include="../libs/Newtonsoft.Json.dll" />'), 'f/x.cs': '',
      'src/Acme.Api/Acme.Api.csproj': PROJECT, 'src/Acme.Api/a.cs': '',
      'src/Json/Json.csproj': PROJECT, 'src/Json/j.cs': '',
    });
    expect(reach('f/x.cs', 'src/Acme.Api/a.cs')).toBe('reachable');
    expect(reach('f/x.cs', 'src/Json/j.cs')).toBe('unreachable');
  });

  it('reads an AssemblyName set in a Directory.Build.props, with $(MSBuildProjectName)', () => {
    const reach = reachOf({
      'f/F.csproj': withItems('<Reference Include="Acme.Core" />'), 'f/x.cs': '',
      'src/Directory.Build.props': '<Project><PropertyGroup><AssemblyName>Acme.$(MSBuildProjectName)</AssemblyName></PropertyGroup></Project>',
      'src/Core/Core.csproj': PROJECT, 'src/Core/c.cs': '',
      'src/Other/Other.csproj': PROJECT, 'src/Other/o.cs': '',
    });
    expect(reach('f/x.cs', 'src/Core/c.cs')).toBe('reachable');
    expect(reach('f/x.cs', 'src/Other/o.cs')).toBe('unreachable');
  });

  it('does not walk dot-directories, bin, obj or node_modules for assembly names', () => {
    const reach = reachOf({
      'f/F.csproj': withItems('<Reference Include="Hidden" />'), 'f/x.cs': '',
      'f/obj/Hidden.csproj': PROJECT, 'f/obj/h.cs': '',
      '.cache/Hidden2.csproj': PROJECT,
    });
    expect(reach('f/x.cs', 'f/obj/h.cs')).toBe('unreachable');
  });
});

describe('buildCsharpReachability — Directory.Build files and imports', () => {
  it('reads every Directory.Build.props and .targets above a project', () => {
    const reach = reachOf({
      'Directory.Build.targets': withItems(projectRef('$(MSBuildThisFileDirectory)lib/Lib.csproj')),
      'src/Directory.Build.props': withItems(projectRef('$(MSBuildThisFileDirectory)../core/Core.csproj')),
      'src/a/A.csproj': PROJECT, 'src/a/x.cs': '',
      'lib/Lib.csproj': PROJECT, 'lib/l.cs': '',
      'core/Core.csproj': PROJECT, 'core/c.cs': '',
      'other/Other.csproj': PROJECT, 'other/o.cs': '',
    });
    expect(reach('src/a/x.cs', 'lib/l.cs')).toBe('reachable');
    expect(reach('src/a/x.cs', 'core/c.cs')).toBe('reachable');
    expect(reach('src/a/x.cs', 'other/o.cs')).toBe('unreachable');
    // A props file of src/ does not apply to a project outside it.
    expect(reach('lib/l.cs', 'core/c.cs')).toBe('unreachable');
  });

  it('reads a relative path of a props file against the props file and against the project, both', () => {
    const reach = reachOf({
      'src/Directory.Build.props': withItems(projectRef('../core/Core.csproj')),
      'src/a/A.csproj': PROJECT, 'src/a/x.cs': '',
      'core/Core.csproj': PROJECT, 'core/c.cs': '',
      'other/Other.csproj': PROJECT, 'other/o.cs': '',
    });
    // From the props file's directory, ../core is core/; from the project's directory src/a, ../core is src/core (absent): one reading finds the file, so the project stays closed.
    expect(reach('src/a/x.cs', 'core/c.cs')).toBe('reachable');
    expect(reach('src/a/x.cs', 'other/o.cs')).toBe('unreachable');
    // A project-relative reading of ../shared from src/a lands on src/shared.
    const second = reachOf({
      'src/Directory.Build.props': withItems(projectRef('../shared/Shared.csproj')),
      'src/a/A.csproj': PROJECT, 'src/a/x.cs': '',
      'src/shared/Shared.csproj': PROJECT, 'src/shared/s.cs': '',
    });
    expect(second('src/a/x.cs', 'src/shared/s.cs')).toBe('reachable');
  });

  it('reads an imported file the view holds like the project file', () => {
    const reach = reachOf({
      'a/A.csproj': '<Project Sdk="Microsoft.NET.Sdk"><Import Project="..\\build\\refs.props" /></Project>', 'a/x.cs': '',
      'build/refs.props': withItems(projectRef('$(MSBuildThisFileDirectory)../b/B.csproj')),
      'b/B.csproj': PROJECT, 'b/z.cs': '',
      'c/C.csproj': PROJECT, 'c/w.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('reachable');
    expect(reach('a/x.cs', 'c/w.cs')).toBe('unreachable');
  });

  it('finds a Directory.Build file and an imported file whose directories or names are spelled in another case', () => {
    const reach = reachOf({
      'src/directory.build.PROPS': withItems(projectRef('$(MSBuildThisFileDirectory)Core/Core.csproj')),
      'src/a/A.csproj': '<Project><Import Project="..\\BUILD\\refs.props" /></Project>', 'src/a/x.cs': '',
      'src/build/refs.props': withItems(projectRef('$(MSBuildThisFileDirectory)../lib/Lib.csproj')),
      'src/Core/Core.csproj': PROJECT, 'src/Core/c.cs': '',
      'src/Lib/Lib.csproj': PROJECT, 'src/Lib/l.cs': '',
      'src/other/Other.csproj': PROJECT, 'src/other/o.cs': '',
    });
    expect(reach('src/a/x.cs', 'src/Core/c.cs')).toBe('reachable');
    expect(reach('src/a/x.cs', 'src/Lib/l.cs')).toBe('reachable');
    expect(reach('src/a/x.cs', 'src/other/o.cs')).toBe('unreachable');
  });

  it('reads a project as open for an unconditional import of a file the view does not hold', () => {
    const reach = reachOf({
      'a/A.csproj': '<Project><Import Project="missing.props" /></Project>', 'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('unknown');
  });

  it('reads an import cycle once', () => {
    const reach = reachOf({
      'a/A.csproj': '<Project><Import Project="one.props" /></Project>', 'a/one.props': '<Project><Import Project="two.props" /></Project>', 'a/two.props': '<Project><Import Project="one.props" /></Project>', 'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('unreachable');
  });

  it('ignores the SDK imports, the toolchain imports and the Directory.Build lookups, and an import of a file that is not there', () => {
    const reach = reachOf({
      'a/A.csproj': [
        '<Project>',
        '<Import Project="Sdk.props" Sdk="Microsoft.NET.Sdk" />',
        '<Import Project="Sdk.targets" />',
        '<Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" />',
        '<Import Project="$([MSBuild]::GetPathOfFileAbove(\'Directory.Build.props\', \'$(MSBuildThisFileDirectory)../\'))" />',
        '<Import Project="missing.props" Condition="Exists(\'missing.props\')" />',
        '</Project>',
      ].join(''),
      'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('unreachable');
  });

  it('reads a project as open for an import it cannot resolve, a wildcard import and a shared project: it may see anything, which is unknown, not reachable', () => {
    for (const imp of ['<Import Project="$(RepoRoot)build/refs.props" />', '<Import Project="build/*.props" />', '<Import Project="..\\Shared\\Shared.projitems" Label="Shared" />']) {
      const reach = reachOf({
        'a/A.csproj': `<Project>${imp}</Project>`, 'a/x.cs': '',
        'b/B.csproj': PROJECT, 'b/z.cs': '',
      });
      expect(reach('a/x.cs', 'b/z.cs'), imp).toBe('unknown');
    }
  });
});

describe('buildCsharpReachability — files a project takes out of its compilation', () => {
  const layout = (webProject, extra = {}) => reachOf({
    'core/Core.csproj': PROJECT, 'core/Order.cs': '',
    'web/Web.csproj': webProject, 'web/Api.cs': '', 'web/Old/Order.cs': '', 'web/Old/Deep/Line.cs': '',
    'app/App.csproj': withItems(projectRef('../web/Web.csproj')), 'app/x.cs': '',
    ...extra,
  });

  it('reads a file under Compile Remove as code of no compilation: no caller sees it, and its own references bind nowhere the graph knows', () => {
    const reach = layout(withItems('<Compile Remove="Old/**" />', projectRef('../core/Core.csproj')));
    expect(reach('web/Api.cs', 'web/Old/Order.cs')).toBe('unreachable');
    expect(reach('web/Api.cs', 'web/Old/Deep/Line.cs')).toBe('unreachable');
    expect(reach('app/x.cs', 'web/Old/Order.cs')).toBe('unreachable');
    expect(reach('web/Old/Order.cs', 'core/Order.cs')).toBe('unknown');
    expect(reach('web/Api.cs', 'core/Order.cs')).toBe('reachable');
    expect(reach('app/x.cs', 'web/Api.cs')).toBe('reachable');
  });

  it('reads a removal of several files, a file path and a backslash path', () => {
    const reach = layout(withItems('<Compile Remove="Old\\Order.cs;Old\\Deep\\*.cs" />'));
    expect(reach('web/Api.cs', 'web/Old/Order.cs')).toBe('unreachable');
    expect(reach('web/Api.cs', 'web/Old/Deep/Line.cs')).toBe('unreachable');
  });

  it('keeps a file that a Compile Include of the same project names again, before or after the removal', () => {
    for (const items of [['<Compile Remove="Old/**" />', '<Compile Include="Old/Order.cs" />'], ['<Compile Include="Old/Order.cs" />', '<Compile Remove="Old/**" />']]) {
      const reach = layout(withItems(...items));
      expect(reach('web/Api.cs', 'web/Old/Order.cs'), items.join('')).toBe('same');
      expect(reach('web/Api.cs', 'web/Old/Deep/Line.cs'), items.join('')).toBe('unreachable');
    }
  });

  it('ignores a removal that may not apply: under a condition on the item, its ItemGroup or a Choose branch, or inside a Target', () => {
    for (const web of [
      withItems('<Compile Remove="Old/**" Condition="\'$(TargetFramework)\' != \'net48\'" />'),
      '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup Condition="\'$(Legacy)\' != \'true\'"><Compile Remove="Old/**" /></ItemGroup></Project>',
      '<Project Sdk="Microsoft.NET.Sdk"><Choose><When Condition="true"><ItemGroup><Compile Remove="Old/**" /></ItemGroup></When></Choose></Project>',
      '<Project Sdk="Microsoft.NET.Sdk"><Target Name="Trim" BeforeTargets="CoreCompile"><ItemGroup><Compile Remove="Old/**" /></ItemGroup></Target></Project>',
    ]) {
      expect(layout(web)('web/Api.cs', 'web/Old/Order.cs'), web).toBe('same');
    }
  });

  it('reads a removal after a closed conditional group as one that applies', () => {
    const web = '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup Condition="false"><Compile Include="x.cs" /></ItemGroup><Target Name="T" /><ItemGroup><Compile Remove="Old/**" /></ItemGroup></Project>';
    expect(layout(web)('web/Api.cs', 'web/Old/Order.cs')).toBe('unreachable');
  });

  it('reads a removal in a Directory.Build.props against the project being built, and $(MSBuildThisFileDirectory) against the props file', () => {
    const fromProps = layout(PROJECT, { 'Directory.Build.props': withItems('<Compile Remove="Old/**" />') });
    expect(fromProps('web/Api.cs', 'web/Old/Order.cs')).toBe('unreachable');
    const thisFile = layout(PROJECT, { 'Directory.Build.props': withItems('<Compile Remove="$(MSBuildThisFileDirectory)web/Old/**" />') });
    expect(thisFile('web/Api.cs', 'web/Old/Order.cs')).toBe('unreachable');
    expect(thisFile('web/Api.cs', 'web/Old/Deep/Line.cs')).toBe('unreachable');
  });

  it('ignores a removal it cannot place: one that needs an unknown property or leaves the repository', () => {
    for (const item of ['<Compile Remove="$(OldDir)/**" />', '<Compile Remove="../../Old/**" />']) {
      expect(layout(withItems(item))('web/Api.cs', 'web/Old/Order.cs'), item).toBe('same');
    }
  });
});

describe('buildCsharpReachability — internals and friend assemblies', () => {
  const layout = (lib, extra = {}) => reachOf({
    'src/Lib/Lib.csproj': lib, 'src/Lib/Order.cs': '',
    'src/Web/Web.csproj': withItems(projectRef('../Lib/Lib.csproj')), 'src/Web/Api.cs': '',
    'src/Web.Tests/Web.Tests.csproj': withItems(projectRef('../Lib/Lib.csproj')), 'src/Web.Tests/t.cs': '',
    ...extra,
  });

  it('answers that a project sees its own internals and no other project sees them without a grant', () => {
    const reach = layout(PROJECT, { 'src/Lib/Inner.cs': '' });
    expect(reach.internalsVisible('src/Lib/Inner.cs', 'src/Lib/Order.cs')).toBe(true);
    expect(reach.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(false);
    expect(reach.internalsVisible('src/Web.Tests/t.cs', 'src/Lib/Order.cs')).toBe(false);
  });

  it('reads InternalsVisibleTo items, with the project name and assembly name properties read as the project\'s names', () => {
    for (const [item, props] of [
      ['<InternalsVisibleTo Include="Web.Tests" />', undefined],
      ['<InternalsVisibleTo Include="web.tests" Key="0024000004800000" />', undefined],
      ['<InternalsVisibleTo Include="Web.Tests, PublicKey=0024000004800000" />', undefined],
      ['', withItems('<InternalsVisibleTo Include="Web.$(MSBuildProjectName)" />')],
    ]) {
      const extra = props === undefined ? {} : { 'src/Directory.Build.props': props };
      const lib = props === undefined ? withItems(item) : PROJECT;
      const reach = layout(lib, { ...extra, 'src/Tests.Lib/Web.Lib.csproj': withItems(projectRef('../Lib/Lib.csproj')), 'src/Tests.Lib/x.cs': '' });
      if (props === undefined) {
        expect(reach.internalsVisible('src/Web.Tests/t.cs', 'src/Lib/Order.cs'), item).toBe(true);
        expect(reach.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs'), item).toBe(false);
      } else {
        expect(reach.internalsVisible('src/Tests.Lib/x.cs', 'src/Lib/Order.cs')).toBe(true);
        expect(reach.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(false);
      }
    }
    const named = layout(['<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><AssemblyName>Acme.Lib</AssemblyName></PropertyGroup>', '<ItemGroup><InternalsVisibleTo Include="$(AssemblyName).Tests" /></ItemGroup></Project>'].join(''), {
      'src/Acme/Acme.Lib.Tests.csproj': withItems(projectRef('../Lib/Lib.csproj')), 'src/Acme/x.cs': '',
    });
    expect(named.internalsVisible('src/Acme/x.cs', 'src/Lib/Order.cs')).toBe(true);
    expect(named.internalsVisible('src/Web.Tests/t.cs', 'src/Lib/Order.cs')).toBe(false);
  });

  it('names the caller by its assembly name as well as its project file', () => {
    const reach = layout(withItems('<InternalsVisibleTo Include="Acme.Web" />'), {
      'src/Web/Web.csproj': '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><AssemblyName>Acme.Web</AssemblyName></PropertyGroup><ItemGroup><ProjectReference Include="../Lib/Lib.csproj" /></ItemGroup></Project>',
    });
    expect(reach.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(true);
  });

  it('reads an AssemblyAttribute item of InternalsVisibleTo, and one with no parameter it can read as naming every project', () => {
    const one = layout(withItems('<AssemblyAttribute Include="System.Runtime.CompilerServices.InternalsVisibleTo"><_Parameter1>Web.Tests</_Parameter1></AssemblyAttribute>', '<AssemblyAttribute Include="Other.Attribute" />'));
    expect(one.internalsVisible('src/Web.Tests/t.cs', 'src/Lib/Order.cs')).toBe(true);
    expect(one.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(false);
    const any = layout(withItems('<AssemblyAttribute Include="InternalsVisibleToAttribute" />'));
    expect(any.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(true);
  });

  it('reads the assembly attributes of the files the project compiles, a linked one included, and a grant it cannot name as naming every project', () => {
    const attr = layout(PROJECT, { 'src/Lib/Properties/AssemblyInfo.cs': 'using System.Runtime.CompilerServices;\n[assembly: InternalsVisibleTo("Web.Tests, PublicKey=00240000")]\n[assembly: System.Runtime.CompilerServices.InternalsVisibleToAttribute(@"Other")]' });
    expect(attr.internalsVisible('src/Web.Tests/t.cs', 'src/Lib/Order.cs')).toBe(true);
    expect(attr.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(false);
    const linked = layout(withItems('<Compile Include="../Common/Friends.cs" />'), { 'src/Common/Friends.cs': '[assembly: InternalsVisibleTo("Web")]' });
    expect(linked.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(true);
    expect(linked.internalsVisible('src/Web.Tests/t.cs', 'src/Lib/Order.cs')).toBe(false);
    const removed = layout(withItems('<Compile Remove="Old/**" />'), { 'src/Lib/Old/Friends.cs': '[assembly: InternalsVisibleTo("Web")]' });
    expect(removed.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(false);
    const constant = layout(PROJECT, { 'src/Lib/Friends.cs': '[assembly: InternalsVisibleTo(Names.Tests)]' });
    expect(constant.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(true);
    const property = layout(withItems('<InternalsVisibleTo Include="$(TestPrefix).Web" />'));
    expect(property.internalsVisible('src/Web/Api.cs', 'src/Lib/Order.cs')).toBe(true);
  });

  it('answers visible when the graph cannot say: a file it does not know, a file in no compilation, or a target reached only through an open project', () => {
    const reach = layout(withItems('<Compile Remove="Old/**" />'), {
      'src/Lib/Old/Gone.cs': '', 'loose/x.cs': '',
      'src/Open/Open.csproj': withItems(projectRef('$(Mystery)/X.csproj')), 'src/Open/o.cs': '',
    });
    expect(reach.internalsVisible('loose/x.cs', 'src/Lib/Order.cs')).toBe(true);
    expect(reach.internalsVisible('src/Web/Api.cs', 'loose/x.cs')).toBe(true);
    expect(reach.internalsVisible('src/Lib/Old/Gone.cs', 'src/Web/Api.cs')).toBe(true);
    expect(reach.internalsVisible('src/Web/Api.cs', 'src/Lib/Old/Gone.cs')).toBe(true);
    expect(reach.internalsVisible('src/Open/o.cs', 'src/Lib/Order.cs')).toBe(true);
  });
});

describe('buildCsharpReachability — open projects', () => {
  it('reads a project as open for a Compile item that needs an unknown property or leaves the repository', () => {
    for (const item of ['<Compile Include="$(GenDir)/g.cs" />', '<Compile Include="C:\\gen\\g.cs" />']) {
      const reach = reachOf({
        'a/A.csproj': withItems(item), 'a/x.cs': '',
        'b/B.csproj': PROJECT, 'b/z.cs': '',
      });
      expect(reach('a/x.cs', 'b/z.cs'), item).toBe('unknown');
    }
  });

  it('keeps a project closed for Compile items inside its directory', () => {
    const reach = reachOf({
      'a/A.csproj': withItems('<Compile Include="src\\**\\*.cs" />', '<Compile Include="$(MSBuildProjectDirectory)/gen/g.cs" />', '<Compile Remove="obj/**" />'), 'a/x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('a/x.cs', 'b/z.cs')).toBe('unreachable');
  });

  it('sees a linked file as code of the project that links it: as a caller it reaches what that project references', () => {
    const reach = reachOf({
      'src/Lib/Lib.csproj': PROJECT, 'src/Lib/Feature.cs': '',
      'src/Lib.NetFx/Lib.NetFx.csproj': withItems('<Compile Include="..\\Lib\\**\\*.cs" />', projectRef('../Legacy/Legacy.csproj')),
      'src/Legacy/Legacy.csproj': PROJECT, 'src/Legacy/Helper.cs': '',
      'src/Other/Other.csproj': PROJECT, 'src/Other/o.cs': '',
    });
    expect(reach('src/Lib/Feature.cs', 'src/Legacy/Helper.cs')).toBe('reachable');
    // The link adds the linked files to Lib.NetFx and nothing else, so the graph stays closed.
    expect(reach('src/Lib/Feature.cs', 'src/Other/o.cs')).toBe('unreachable');
    expect(reach('src/Other/o.cs', 'src/Legacy/Helper.cs')).toBe('unreachable');
  });

  it('keeps a project closed for a linked file, which is code of the project that links it', () => {
    const reach = reachOf({
      'src/Bus/Bus.csproj': withItems('<Compile Include="..\\Shared\\Tracing.cs" Link="Tracing.cs" />'), 'src/Bus/b.cs': '',
      'src/Shared/Tracing.cs': '', 'src/Shared/Unlinked.cs': '',
      'src/Api/Api.csproj': withItems(projectRef('../Bus/Bus.csproj')), 'src/Api/Program.cs': '',
      'src/Catalog/Catalog.csproj': withItems(projectRef('../Bus/Bus.csproj')), 'src/Catalog/Extensions.cs': '',
    });
    expect(reach('src/Api/Program.cs', 'src/Catalog/Extensions.cs')).toBe('unreachable');
    expect(reach('src/Api/Program.cs', 'src/Bus/b.cs')).toBe('reachable');
    expect(reach('src/Api/Program.cs', 'src/Shared/Tracing.cs')).toBe('reachable');
    expect(reach('src/Bus/b.cs', 'src/Shared/Tracing.cs')).toBe('same');
    expect(reach('src/Shared/Tracing.cs', 'src/Bus/b.cs')).toBe('same');
    expect(reach('src/Shared/Tracing.cs', 'src/Api/Program.cs')).toBe('unreachable');
    expect(reach('src/Catalog/Extensions.cs', 'src/Shared/Tracing.cs')).toBe('reachable');
    // A file under no project that no project links is still unknown.
    expect(reach('src/Api/Program.cs', 'src/Shared/Unlinked.cs')).toBe('unknown');
    expect(reach('src/Shared/Unlinked.cs', 'src/Api/Program.cs')).toBe('unknown');
  });

  it('reads two projects that link one file as one compilation for that file, and a link of a file another project removes', () => {
    const reach = reachOf({
      'src/A/A.csproj': withItems('<Compile Include="../Shared/**/*.cs" />'), 'src/A/a.cs': '',
      'src/B/B.csproj': withItems('<Compile Include="../Shared/**" />'), 'src/B/b.cs': '',
      'src/Shared/Deep/s.cs': '',
      'src/Old/Old.csproj': withItems('<Compile Remove="Moved.cs" />'), 'src/Old/Moved.cs': '',
      'src/New/New.csproj': withItems('<Compile Include="..\\Old\\Moved.cs" />'), 'src/New/n.cs': '',
      'src/C/C.csproj': withItems(projectRef('../Old/Old.csproj')), 'src/C/c.cs': '',
    });
    expect(reach('src/A/a.cs', 'src/Shared/Deep/s.cs')).toBe('same');
    expect(reach('src/B/b.cs', 'src/Shared/Deep/s.cs')).toBe('same');
    expect(reach('src/A/a.cs', 'src/B/b.cs')).toBe('unreachable');
    expect(reach('src/New/n.cs', 'src/Old/Moved.cs')).toBe('same');
    expect(reach('src/C/c.cs', 'src/Old/Moved.cs')).toBe('unreachable');
    expect(reach('src/Old/Moved.cs', 'src/New/n.cs')).toBe('same');
  });

  it('reads a project at the repository root as open for a Compile item that leaves the root', () => {
    const reach = reachOf({
      'A.csproj': withItems('<Compile Include="../x.cs" />'), 'x.cs': '',
      'b/B.csproj': PROJECT, 'b/z.cs': '',
    });
    expect(reach('x.cs', 'b/z.cs')).toBe('unknown');
  });

  it('reaches everything through an open project the caller references', () => {
    const reach = reachOf({
      'a/A.csproj': withItems(projectRef('../b/B.csproj')), 'a/x.cs': '',
      'b/B.csproj': withItems(projectRef('$(Mystery)/C.csproj')), 'b/y.cs': '',
      'c/C.csproj': PROJECT, 'c/z.cs': '',
    });
    expect(reach('a/x.cs', 'c/z.cs')).toBe('unknown');
    expect(reach('c/z.cs', 'a/x.cs')).toBe('unreachable');
  });

  it('reads the disk under the project root when no view is given', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'runes-reach-'));
    try {
      const put = (rel, text) => {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), text, 'utf-8');
      };
      put('a/A.csproj', withItems(projectRef('../b/B.csproj')));
      put('a/x.cs', '');
      put('b/B.csproj', PROJECT);
      put('b/z.cs', '');
      put('c/C.csproj', PROJECT);
      put('c/w.cs', '');
      const reach = buildCsharpReachability(root, ['a/x.cs', 'b/z.cs', 'c/w.cs']);
      expect(reach('a/x.cs', 'b/z.cs')).toBe('reachable');
      expect(reach('a/x.cs', 'c/w.cs')).toBe('unreachable');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
