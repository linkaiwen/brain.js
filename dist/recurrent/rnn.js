'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _sampleI2 = require('../matrix/sample-i');

var _sampleI3 = _interopRequireDefault(_sampleI2);

var _maxI = require('../matrix/max-i');

var _maxI2 = _interopRequireDefault(_maxI);

var _matrix = require('../matrix');

var _matrix2 = _interopRequireDefault(_matrix);

var _randomMatrix = require('../matrix/random-matrix');

var _randomMatrix2 = _interopRequireDefault(_randomMatrix);

var _softmax = require('../matrix/softmax');

var _softmax2 = _interopRequireDefault(_softmax);

var _equation = require('../utilities/equation');

var _equation2 = _interopRequireDefault(_equation);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var defaults = {
  isBackPropagate: true,
  // hidden size should be a list
  inputSize: 20,
  inputRange: 20,
  hiddenSizes: [20, 20],
  outputSize: 20,
  learningRate: 0.01,
  decayRate: 0.999,
  smoothEps: 1e-8,
  regc: 0.000001,
  clipval: 5,
  json: null
};

var RNN = function () {
  function RNN(options) {
    _classCallCheck(this, RNN);

    options = options || {};

    for (var p in defaults) {
      if (defaults.hasOwnProperty(p) && p !== 'isBackPropagate') {
        this[p] = options.hasOwnProperty(p) ? options[p] : defaults[p];
      }
    }

    this.stepCache = {};
    this.runs = 0;
    this.logProbabilities = null;
    this.totalPerplexity = null;
    this.totalCost = null;

    this.model = {
      input: [],
      inputRows: [],
      equations: [],
      hidden: [],
      output: null,
      allMatrices: [],
      hiddenLayers: []
    };

    if (this.json) {
      this.fromJSON(this.json);
    } else {
      this.createModel();
      this.mapModel();
    }
  }

  _createClass(RNN, [{
    key: 'createModel',
    value: function createModel() {
      var hiddenSizes = this.hiddenSizes;
      var model = this.model;
      var hiddenLayers = model.hiddenLayers;
      //0 is end, so add 1 to offset
      hiddenLayers.push(this.getModel(hiddenSizes[0], this.inputSize));
      var prevSize = hiddenSizes[0];

      for (var d = 1; d < hiddenSizes.length; d++) {
        // loop over depths
        var hiddenSize = hiddenSizes[d];
        hiddenLayers.push(this.getModel(hiddenSize, prevSize));
        prevSize = hiddenSize;
      }
    }
  }, {
    key: 'getModel',
    value: function getModel(hiddenSize, prevSize) {
      return {
        //wxh
        weight: new _randomMatrix2.default(hiddenSize, prevSize, 0.08),
        //whh
        transition: new _randomMatrix2.default(hiddenSize, hiddenSize, 0.08),
        //bhh
        bias: new _matrix2.default(hiddenSize, 1)
      };
    }

    /**
     *
     * @param {Equation} equation
     * @param {Matrix} inputMatrix
     * @param {Number} size
     * @param {Object} hiddenLayer
     * @returns {Matrix}
     */

  }, {
    key: 'getEquation',
    value: function getEquation(equation, inputMatrix, size, hiddenLayer) {
      var relu = equation.relu.bind(equation);
      var add = equation.add.bind(equation);
      var multiply = equation.multiply.bind(equation);
      var previousResult = equation.previousResult.bind(equation);
      var result = equation.result.bind(equation);

      return result(relu(add(add(multiply(hiddenLayer.weight, inputMatrix), multiply(hiddenLayer.transition, previousResult(size))), hiddenLayer.bias)));
    }
  }, {
    key: 'createInputMatrix',
    value: function createInputMatrix() {
      //0 is end, so add 1 to offset
      this.model.input = new _randomMatrix2.default(this.inputRange + 1, this.inputSize, 0.08);
    }
  }, {
    key: 'createOutputMatrix',
    value: function createOutputMatrix() {
      var model = this.model;
      var outputSize = this.outputSize;
      var lastHiddenSize = this.hiddenSizes[this.hiddenSizes.length - 1];

      //0 is end, so add 1 to offset
      //whd
      model.outputConnector = new _randomMatrix2.default(outputSize + 1, lastHiddenSize, 0.08);
      //0 is end, so add 1 to offset
      //bd
      model.output = new _matrix2.default(outputSize + 1, 1);
    }
  }, {
    key: 'bindEquations',
    value: function bindEquations() {
      var model = this.model;
      var hiddenSizes = this.hiddenSizes;
      var hiddenLayers = model.hiddenLayers;

      var equation = new _equation2.default();
      model.equations.push(equation);
      // 0 index
      var output = this.getEquation(equation, equation.inputMatrixToRow(model.input), hiddenSizes[0], hiddenLayers[0]);
      // 1+ indexes
      for (var _i = 1, max = hiddenSizes.length; _i < max; _i++) {
        output = this.getEquation(equation, output, hiddenSizes[_i], hiddenLayers[_i]);
      }
      equation.add(equation.multiply(model.outputConnector, output), model.output);
    }
  }, {
    key: 'mapModel',
    value: function mapModel() {
      var model = this.model;
      var hiddenLayers = model.hiddenLayers;
      var allMatrices = model.allMatrices;

      this.createInputMatrix();
      if (!model.input) throw new Error('net.model.input not set');

      this.createOutputMatrix();
      if (!model.outputConnector) throw new Error('net.model.outputConnector not set');
      if (!model.output) throw new Error('net.model.output not set');

      this.bindEquations();
      if (!model.equations.length > 0) throw new Error('net.equations not set');

      allMatrices.push(model.input);

      for (var _i2 = 0, max = hiddenLayers.length; _i2 < max; _i2++) {
        var hiddenMatrix = hiddenLayers[_i2];
        for (var property in hiddenMatrix) {
          if (!hiddenMatrix.hasOwnProperty(property)) continue;
          allMatrices.push(hiddenMatrix[property]);
        }
      }

      allMatrices.push(model.outputConnector);
      allMatrices.push(model.output);
    }
  }, {
    key: 'run',
    value: function run(input) {
      this.runs++;
      input = input || this.model.input;
      var equations = this.model.equations;
      var max = input.length;
      var log2ppl = 0;
      var cost = 0;

      for (var equationIndex = 0, equationMax = equations.length; equationIndex < equationMax; equationIndex++) {
        equations[equationIndex].resetPreviousResults();
      }

      while (equations.length <= max) {
        this.bindEquations();
      }

      var i = void 0;
      var output = void 0;
      for (i = -1; i < max; i++) {
        // start and end tokens are zeros
        var equation = equations[i + 1];
        var ixSource = i === -1 ? 0 : input[i]; // first step: start with START token
        var ixTarget = i === max - 1 ? 0 : input[i + 1]; // last step: end with END token
        output = equation.run(ixSource);
        equation.updatePreviousResults();

        // set gradients into log probabilities
        this.logProbabilities = output; // interpret output as log probabilities
        var probabilities = (0, _softmax2.default)(output); // compute the softmax probabilities

        log2ppl += -Math.log2(probabilities.weights[ixTarget]); // accumulate base 2 log prob and do smoothing
        cost += -Math.log(probabilities.weights[ixTarget]);

        // write gradients into log probabilities
        this.logProbabilities.recurrence = probabilities.weights.slice(0);
        this.logProbabilities.recurrence[ixTarget] -= 1;
      }

      while (i-- > 0) {
        equations[i].runBackpropagate();
      }

      this.step();

      this.totalPerplexity = Math.pow(2, log2ppl / (max - 1));
      this.totalCost = cost;
      return output;
    }
  }, {
    key: 'step',
    value: function step() {
      // perform parameter update
      var stepSize = this.learningRate;
      var regc = this.regc;
      var clipval = this.clipval;
      var model = this.model;
      var numClipped = 0;
      var numTot = 0;
      var allMatrices = model.allMatrices;
      var matrixIndexes = allMatrices.length;
      for (var matrixIndex = 0; matrixIndex < matrixIndexes; matrixIndex++) {
        var matrix = allMatrices[matrixIndex];
        if (!(matrixIndex in this.stepCache)) {
          this.stepCache[matrixIndex] = new _matrix2.default(matrix.rows, matrix.columns);
        }
        var cache = this.stepCache[matrixIndex];

        for (var _i3 = 0, n = matrix.weights.length; _i3 < n; _i3++) {
          // rmsprop adaptive learning rate
          var mdwi = matrix.recurrence[_i3];
          cache.weights[_i3] = cache.weights[_i3] * this.decayRate + (1 - this.decayRate) * mdwi * mdwi;
          // gradient clip
          if (mdwi > clipval) {
            mdwi = clipval;
            numClipped++;
          }
          if (mdwi < -clipval) {
            mdwi = -clipval;
            numClipped++;
          }
          numTot++;

          // update (and regularize)
          matrix.weights[_i3] += -stepSize * mdwi / Math.sqrt(cache.weights[_i3] + this.smoothEps) - regc * matrix.weights[_i3];
          matrix.recurrence[_i3] = 0; // reset gradients for next iteration
        }
      }
      this.ratioClipped = numClipped / numTot;
    }
  }, {
    key: 'predict',
    value: function predict(_sampleI, temperature, predictionLength) {
      if (typeof _sampleI === 'undefined') {
        _sampleI = true;
      }
      if (typeof temperature === 'undefined') {
        temperature = 1;
      }
      if (typeof predictionLength === 'undefined') {
        predictionLength = 100;
      }

      var result = [];
      //let prev;
      var ix = void 0;
      var equation = this.model.equations[0];
      //equation.resetPreviousResults();
      while (true) {
        ix = result.length === 0 ? 0 : result[result.length - 1];
        var lh = equation.run(ix);
        //equation.updatePreviousResults();
        //prev = clone(lh);
        // sample predicted letter
        this.logProbabilities = lh;
        if (temperature !== 1 && _sampleI) {
          // scale log probabilities by temperature and renormalize
          // if temperature is high, logprobs will go towards zero
          // and the softmax outputs will be more diffuse. if temperature is
          // very low, the softmax outputs will be more peaky
          for (var q = 0, nq = this.logProbabilities.weights.length; q < nq; q++) {
            this.logProbabilities.weights[q] /= temperature;
          }
        }

        var probs = (0, _softmax2.default)(this.logProbabilities);

        if (_sampleI) {
          ix = (0, _sampleI3.default)(probs);
        } else {
          ix = (0, _maxI2.default)(probs);
        }

        if (ix === 0) {
          // END token predicted, break out
          break;
        }
        if (result.length > predictionLength) {
          // something is wrong
          break;
        }

        result.push(ix);
      }

      return result;
    }

    /**
     *
     * @param input
     * @returns {*}
     */

  }, {
    key: 'runInput',
    value: function runInput(input) {
      this.outputs[0] = input; // set output state of input layer

      var output = null;
      for (var layer = 1; layer <= this.outputLayer; layer++) {
        for (var node = 0; node < this.sizes[layer]; node++) {
          var weights = this.weights[layer][node];

          var sum = this.biases[layer][node];
          for (var k = 0; k < weights.length; k++) {
            sum += weights[k] * input[k];
          }
          this.outputs[layer][node] = 1 / (1 + Math.exp(-sum));
        }
        output = input = this.outputs[layer];
      }
      return output;
    }

    /**
     *
     * @param data
     * @param options
     * @returns {{error: number, iterations: number}}
     */

  }, {
    key: 'train',
    value: function train(data, options) {
      throw new Error('not yet implemented');
      //data = this.formatData(data);

      options = options || {};
      var iterations = options.iterations || 20000;
      var errorThresh = options.errorThresh || 0.005;
      var log = options.log ? typeof options.log === 'function' ? options.log : console.log : false;
      var logPeriod = options.logPeriod || 10;
      var learningRate = options.learningRate || this.learningRate || 0.3;
      var callback = options.callback;
      var callbackPeriod = options.callbackPeriod || 10;
      var sizes = [];
      var inputSize = data[0].input.length;
      var outputSize = data[0].output.length;
      var hiddenSizes = this.hiddenSizes;
      if (!hiddenSizes) {
        sizes.push(Math.max(3, Math.floor(inputSize / 2)));
      } else {
        hiddenSizes.forEach(function (size) {
          sizes.push(size);
        });
      }

      sizes.unshift(inputSize);
      sizes.push(outputSize);

      //this.initialize(sizes, options.keepNetworkIntact);

      var error = 1;
      for (var _i4 = 0; _i4 < iterations && error > errorThresh; _i4++) {
        var sum = 0;
        for (var j = 0; j < data.length; j++) {
          var err = this.trainPattern(data[j].input, data[j].output, learningRate);
          sum += err;
        }
        error = sum / data.length;

        if (log && _i4 % logPeriod == 0) {
          log('iterations:', _i4, 'training error:', error);
        }
        if (callback && _i4 % callbackPeriod == 0) {
          callback({ error: error, iterations: _i4 });
        }
      }

      return {
        error: error,
        iterations: i
      };
    }

    /**
     *
     * @param input
     * @param target
     * @param learningRate
     */

  }, {
    key: 'trainPattern',
    value: function trainPattern(input, target, learningRate) {
      throw new Error('not yet implemented');
    }

    /**
     *
     * @param target
     */

  }, {
    key: 'calculateDeltas',
    value: function calculateDeltas(target) {
      throw new Error('not yet implemented');
    }

    /**
     *
     * @param learningRate
     */

  }, {
    key: 'adjustWeights',
    value: function adjustWeights(learningRate) {
      throw new Error('not yet implemented');
    }

    /**
     *
     * @param data
     * @returns {*}
     */

  }, {
    key: 'formatData',
    value: function formatData(data) {
      throw new Error('not yet implemented');
    }

    /**
     *
     * @param data
     * @returns {
     *  {
     *    error: number,
     *    misclasses: Array
     *  }
     * }
     */

  }, {
    key: 'test',
    value: function test(data) {
      throw new Error('not yet implemented');
    }
  }, {
    key: 'toJSON',
    value: function toJSON() {
      var model = this.model;
      var options = {};
      for (var p in defaults) {
        options[p] = this[p];
      }

      return {
        type: this.constructor.name,
        options: options,
        input: model.input.toJSON(),
        hiddenLayers: model.hiddenLayers.map(function (hiddenLayer) {
          var layers = {};
          for (var _p in hiddenLayer) {
            layers[_p] = hiddenLayer[_p].toJSON();
          }
          return layers;
        }),
        outputConnector: this.model.outputConnector.toJSON(),
        output: this.model.output.toJSON()
      };
    }
  }, {
    key: 'fromJSON',
    value: function fromJSON(json) {
      this.json = json;
      var model = this.model;
      var options = json.options;
      var allMatrices = model.allMatrices;
      model.input = _matrix2.default.fromJSON(json.input);
      allMatrices.push(model.input);
      model.hiddenLayers = json.hiddenLayers.map(function (hiddenLayer) {
        var layers = {};
        for (var p in hiddenLayer) {
          layers[p] = _matrix2.default.fromJSON(hiddenLayer[p]);
          allMatrices.push(layers[p]);
        }
        return layers;
      });
      model.outputConnector = _matrix2.default.fromJSON(json.outputConnector);
      model.output = _matrix2.default.fromJSON(json.output);
      allMatrices.push(model.outputConnector, model.output);

      for (var p in defaults) {
        if (defaults.hasOwnProperty(p) && p !== 'isBackPropagate') {
          this[p] = options.hasOwnProperty(p) ? options[p] : defaults[p];
        }
      }

      this.bindEquations();
    }

    /**
     *
     * @returns {Function}
     */

  }, {
    key: 'toFunction',
    value: function toFunction() {
      var model = this.model;
      var equation = this.model.equations[0];
      var states = equation.states;
      var modelAsString = JSON.stringify(this.toJSON());

      function matrixOrigin(m, requestedStateIndex) {
        for (var _i5 = 0, max = states.length; _i5 < max; _i5++) {
          var state = states[_i5];

          if (_i5 === requestedStateIndex) {
            switch (m) {
              case state.product:
              case state.left:
              case state.right:
                return 'new Matrix(' + m.rows + ', ' + m.columns + ')';
            }
          }

          if (m === state.product) return 'states[' + _i5 + '].product';
          if (m === state.right) return 'states[' + _i5 + '].right';
          if (m === state.left) return 'states[' + _i5 + '].left';
        }
      }

      function matrixToString(m, stateIndex) {
        if (!m) return 'null';

        for (var _i6 = 0, max = model.hiddenLayers.length; _i6 < max; _i6++) {
          var hiddenLayer = model.hiddenLayers[_i6];
          for (var p in hiddenLayer) {
            if (hiddenLayer[p] === m) {
              return 'model.hiddenLayers[' + _i6 + '].' + p;
            }
          }
        }
        if (m === model.input) return 'model.input';
        if (m === model.outputConnector) return 'model.outputConnector';
        if (m === model.output) return 'model.output';
        return matrixOrigin(m, stateIndex);
      }

      function toInner(fnString) {
        //crude, but should be sufficient for now
        //function() { inner.function.string.here; }
        fnString = fnString.toString().split('{');
        fnString.shift();
        // inner.function.string.here; }
        fnString = fnString.join('{');
        fnString = fnString.split('}');
        fnString.pop();
        // inner.function.string.here;
        return fnString.join('}');
      }

      function fileName(fnName) {
        return 'src/recurrent/matrix/' + fnName.replace(/[A-Z]/g, function (value) {
          return '-' + value.toLowerCase();
        }) + '.js';
      }

      var statesRaw = [];
      var usedFunctionNames = {};
      var innerFunctionsSwitch = [];
      for (var _i7 = 0, max = states.length; _i7 < max; _i7++) {
        var state = states[_i7];
        statesRaw.push('states[' + _i7 + '] = {\n        name: \'' + state.forwardFn.name + '\',\n        left: ' + matrixToString(state.left, _i7) + ',\n        right: ' + matrixToString(state.right, _i7) + ',\n        product: ' + matrixToString(state.product, _i7) + '\n      };');

        var fnName = state.forwardFn.name;
        if (!usedFunctionNames[fnName]) {
          usedFunctionNames[fnName] = true;
          innerFunctionsSwitch.push('\n        case \'' + fnName + '\': //compiled from ' + fileName(fnName) + '\n          ' + toInner(state.forwardFn.toString()) + '\n          break;\n        ');
        }
      }

      return new Function('input', '\n      var model = ' + modelAsString + ';\n      \n      function Matrix(rows, columns) {\n        this.rows = rows;\n        this.columns = columns;\n        this.weights = zeros(rows * columns);\n        this.recurrence = zeros(rows * columns);\n      }\n      \n      function zeros(size) {\n        if (typeof Float64Array !== \'undefined\') return new Float64Array(size);\n        var array = new Array(size);\n        for (var i = 0; i < size; i++) {\n          array[i] = 0;\n        }\n        return array;\n      }\n      \n      for (var inputIndex = 0, inputMax = input.length; inputIndex < inputMax; inputIndex++) {\n        var ixSource = (inputIndex === -1 ? 0 : input[inputIndex]); // first step: start with START token\n        var ixTarget = (inputIndex === inputMax - 1 ? 0 : input[inputIndex + 1]); // last step: end with END token\n        var rowPluckIndex = inputIndex; //connect up to rowPluck\n        var states = {};\n        ' + statesRaw.join('\n') + '\n        for (var stateIndex = 0, stateMax = ' + statesRaw.length + '; stateIndex < stateMax; stateIndex++) {\n          var state = states[stateIndex];\n          var product = state.product;\n          var left = state.left;\n          var right = state.right;\n          \n          switch (state.name) {\n            ' + innerFunctionsSwitch.join('\n') + '\n          }\n        }\n      }\n      \n      return state.product;\n    ');
    }
  }]);

  return RNN;
}();

exports.default = RNN;
//# sourceMappingURL=rnn.js.map