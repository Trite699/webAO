import downloadFile from "../services/downloadFile";
jest.useFakeTimers().setSystemTime(new Date("2020-01-01").getTime());

global.URL.createObjectURL = jest.fn();
const OriginalBlob = global.Blob;
(window as any).global.Blob = function (content, options) {
  return { content, options };
};

// Bun shares globals across test files, so put the real Blob back.
afterAll(() => {
  global.Blob = OriginalBlob;
});

describe("downloadFile", () => {
  it("Creates an <a> tag", () => {
    const createElementSpy = jest.spyOn(document, "createElement");
    downloadFile("hi", "filename");
    expect(createElementSpy).toBeCalled();
  });
  it("Creates the blob with the correct data", () => {
    const data = "writingtestsishard";
    global.URL.createObjectURL = jest.fn(() => data);
    downloadFile(data, "filename");
    const expected = {
      content: [data],
      options: {
        type: "text",
      },
    };
    expect(global.URL.createObjectURL).toBeCalledWith(expected);
  });
});
