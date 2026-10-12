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

describe('buildCsharpReachability — open projects', () => {
  it('reads a project as open for a Compile item outside its directory, or one that needs an unknown property', () => {
    for (const item of ['<Compile Include="..\\Shared\\*.cs" Link="s.cs" />', '<Compile Include="$(GenDir)/g.cs" />', '<Compile Include="C:\\gen\\g.cs" />']) {
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
    // The linking project is open, so the linked file is an unknown to everything else, as before.
    expect(reach('src/Lib/Feature.cs', 'src/Other/o.cs')).toBe('unknown');
    expect(reach('src/Other/o.cs', 'src/Legacy/Helper.cs')).toBe('unreachable');
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
