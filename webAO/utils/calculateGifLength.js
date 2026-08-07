/* eslint no-bitwise: "off" */

/**
 * Adds up the frame delays to find out how long a GIF is
 * I totally didn't steal this
 * @param {data} gifFile the GIF data
 */
const calculateGifLength = (gifFile) => {
  const d = new Uint8Array(gifFile);
  // Thanks to http://justinsomnia.org/2006/10/gif-animation-duration-calculation/
  // And http://www.w3.org/Graphics/GIF/spec-gif89a.txt
  let duration = 0;
  for (let i = 0; i < d.length; i++) {
    // Find a Graphic Control Extension hex(21F904__ ____ __00) that is
    // actually followed by an Image Descriptor (0x2C). The trailing-block
    // check avoids matching the same byte pattern inside compressed image
    // data, which over-counted frames and over-estimated the duration --
    // making looping preanims replay their start before switching to talk.
    if (
      d[i] === 0x21 &&
      d[i + 1] === 0xf9 &&
      d[i + 2] === 0x04 &&
      d[i + 7] === 0x00 &&
      d[i + 8] === 0x2c
    ) {
      // Swap 5th and 6th bytes to get the delay per frame
      const delay = (d[i + 5] << 8) | (d[i + 4] & 0xff);

      // Should be aware browsers have a minimum frame delay
      // e.g. 6ms for IE, 2ms modern browsers (50fps)
      duration += delay < 2 ? 10 : delay;
    }
  }
  return duration * 10;
};
export default calculateGifLength;
