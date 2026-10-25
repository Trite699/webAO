import {
  registerRemoteCharacter,
  encodeRemoteName,
  ingestRemoteName,
  getRemoteCharacter,
  normalizeRemoteBase,
} from "../remoteCharacterStore";
import { getRemoteUrl } from "../resolveLocalAsset";

describe("remote CDN characters", () => {
  it("registers from a folder link and rewrites asset urls", () => {
    const rec = registerRemoteCharacter(
      "https://mastyra.com/base/characters/Means/",
    );
    expect(rec.name).toBe("means");
    expect(
      getRemoteUrl("https://example.org/base/characters/means/(a)happy.gif"),
    ).toBe("https://mastyra.com/base/characters/Means/(a)happy.gif");
    expect(
      getRemoteUrl("https://example.org/base/characters/means/char.ini"),
    ).toBe("https://mastyra.com/base/characters/Means/char.ini");
  });

  it("round-trips the shareable name tag", () => {
    registerRemoteCharacter("https://mastyra.com/base/characters/Means");
    const tagged = encodeRemoteName("Means");
    expect(tagged).toBe("Means~cdn~mastyra.com/base/characters/Means/");
    expect(ingestRemoteName(tagged)).toBe("Means");
    expect(getRemoteCharacter("means")?.base).toBe(
      "https://mastyra.com/base/characters/Means/",
    );
  });

  it("registers an incoming tag for a character it has never seen", () => {
    expect(ingestRemoteName("Foo~cdn~cdn.example.com/b/characters/Foo/")).toBe("Foo");
    expect(getRemoteCharacter("foo")?.base).toBe(
      "https://cdn.example.com/b/characters/Foo/",
    );
  });

  it("rejects private hosts and bad links", () => {
    expect(() => normalizeRemoteBase("http://192.168.1.5/characters/A/")).toThrow();
    expect(() => normalizeRemoteBase("https://localhost/characters/A/")).toThrow();
    expect(() => normalizeRemoteBase("ftp://x.com/characters/A/")).toThrow();
    expect(ingestRemoteName("Evil~cdn~127.0.0.1/characters/Evil/")).toBe("Evil");
    expect(getRemoteCharacter("evil")).toBeUndefined();
  });

  it("leaves untagged names alone", () => {
    expect(ingestRemoteName("Phoenix")).toBe("Phoenix");
    expect(encodeRemoteName("Phoenix")).toBe("Phoenix");
  });
});
