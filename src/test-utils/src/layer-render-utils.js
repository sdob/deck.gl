// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import {document} from 'global';

import {WebMercatorViewport, experimental} from 'deck.gl';
const {DeckGLJS} = experimental;

import diffImages from './luma.gl/gpgpu/diff-images';

export default class RenderingTest {
  constructor({
    testCases,
    width = 800,
    height = 450,
    // Max color delta in the YIQ difference metric for two pixels to be considered the same
    colorDeltaThreshold = 255 * 0.05,
    // Percentage of pixels that must be the same for the test to pass
    testPassThreshold = 0.99,
    reportResult = reportResultInBrowser
  } = {}) {
    assert(testCases);

    this.width = width;
    this.height = height;
    this.colorDeltaThreshold = colorDeltaThreshold;
    this.testPassThreshold = testPassThreshold;
    this.testCases = testCases;
    this.reportResult = reportResult;

    this.state = {
      runningTests: {},
      currentTestIndex: 0,
      renderingCount: 0
    };

    this._initializeDOM();
  }

  setState(state) {
    Object.assign(this.state, state);
  }

  _initializeDOM() {
    // DeckGL container
    const deckGLContainer = document.createElement('div');
    deckGLContainer.style.position = 'absolute';
    // hide deckgl canvas
    deckGLContainer.style.visibility = 'hidden';

    this.referenceImage = createImage(this.width, this.height);
    this.resultImage = createImage(this.width, this.height);
    this.resultImage.style.mixBlendMode = 'difference';

    // Test result container
    const resultContainer = document.createElement('div');
    resultContainer.style.position = 'absolute';
    resultContainer.style.zIndex = 1;

    // Show the image element so the developer could save the image as
    // the golden image
    document.body.appendChild(deckGLContainer);
    document.body.appendChild(this.referenceImage);
    document.body.appendChild(this.resultImage);
    document.body.appendChild(resultContainer);
  }

  _diffResult(name) {
    const referencePixelData = getPixelData(this.referenceImage, this.width, this.height);
    const resultPixelData = getPixelData(this.resultImage, this.width, this.height);

    const pixelCount = resultPixelData.data.length / 4;
    const maxDeltaSq = this.colorDeltaThreshold * this.colorDeltaThreshold;
    let badPixels = 0;
    for (let i = 0; i < pixelCount; i++) {
      const delta = diffImages(resultPixelData.data, referencePixelData.data, i);
      if (delta > maxDeltaSq) {
        badPixels++;
      }
    }

    // Print diff result
    this.reportResult(name, 1 - badPixels / pixelCount);

    // Render the next test case
    this.setState({
      currentTestIndex: this.state.currentTestIndex + 1,
      renderingCount: 0
    });
  }

  _onDrawComplete(name, referenceResult, completed, {gl}) {
    if (!completed) {
      this.setState({
        renderingCount: this.state.renderingCount + 1
      });
      return;
    }

    if (this.state.runningTests[name]) {
      return;
    }
    // Mark current test as running
    this.state.runningTests[name] = true;

    this.referenceImage.onload = () => {
      this.resultImage.onload = () => {
        // Both images are loaded, compare results
        this._diffResult(name);
      };
      this.resultImage.src = gl.canvas.toDataURL();
    };
    this.referenceImage.src = referenceResult;
  }

  run() {
    const {currentTestIndex, renderingCount} = this.state;
    const {width, height, testCases} = this.props;

    if (!testCases[currentTestIndex]) {
      return;
    }

    const {mapViewState, layersList, name, referenceResult, renderingTimes} = testCases[
      currentTestIndex
    ];

    const layers = [];
    const viewportProps = Object.assign({}, mapViewState, {width, height});

    // const needLoadResource = false;
    // constructing layers
    for (const layer of layersList) {
      const {type, props} = layer;
      if (type !== undefined) {
        layers.push(new type(props)); // eslint-disable-line
      }
    }

    const maxRenderingCount = renderingTimes ? renderingTimes : 0;
    const completed = renderingCount >= maxRenderingCount;

    this.deckgl = new DeckGLJS({
      id: 'default-deckgl-overlay',
      layers,
      width: this.width,
      height: this.height,
      debug: true,
      onAfterRender: this._onDrawComplete.bind(this, name, referenceResult, completed),
      viewport: new WebMercatorViewport(viewportProps)
    });
  }
}

function createImage(width, height) {
  const image = document.createElement('img');
  image.width = width;
  image.height = height;
  image.style.position = 'absolute';
  image.style.top = 0;
  image.style.left = 0;
  return image;
}

function getPixelData(sourceElement, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(sourceElement, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

// Default reporting method
function reportResultInBrowser({name, percentage, resultContainer, testPassThreshold}) {
  const passed = percentage >= testPassThreshold;
  const outputString = `${name}: ${(percentage * 100).toFixed(3)}% ${passed ? 'PASS' : 'FAIL'}`;

  const paragraph = document.createElement('p');
  const testResult = document.createTextNode(outputString);
  paragraph.style.color = passed ? '#74ff69' : '#ff2857';
  paragraph.appendChild(testResult);
  resultContainer.appendChild(paragraph);
}
