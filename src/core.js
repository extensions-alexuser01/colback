/**
 * Colback Core
 * =============
 *
 * Author: Yomguithereal
 */

// Dependencies
var Promise = require('promise'),
    Q = require('q');

// Constants
var PARADIGMS = [
  'classical',
  'baroque',
  'modern',
  'promise',
  'deferred'
];

// Helpers
function noop() {}

function atoa(a) {
  return Array.prototype.slice.call(a, 0);
};

function isPlainObject(v) {
  return v instanceof Object &&
         !(v instanceof Array) &&
         !(v instanceof Function);
}

function checkParadigm(paradigm) {
  if (!~PARADIGMS.indexOf(paradigm))
    throw Error('colback: unknown paradigm (' + paradigm + ')');
}

// Main function
function colback(fn, scope) {

  // Checking
  if (!isPlainObject(fn) && typeof fn !== 'function')
    throw Error('colback: first argument must be a function or an object.');

  // Process
  return {
    from: function(fromParadigm) {
      checkParadigm(fromParadigm);

      // Where do we want to go?
      return {
        to: function(toParadigm, engine) {
          checkParadigm(toParadigm);

          if (typeof fn === 'function') {
            return make(fn, scope || null, fromParadigm, toParadigm, engine);
          }
          else {
            var original = fn,
                shifted = {},
                k;

            for (k in original) {
              if (typeof original[k] === 'function')
                shifted[k] = make(original[k], scope || null, fromParadigm, toParadigm, engine);
            }

            return shifted;
          }
        }
      };
    }
  };
}

// Standard engines
colback.promise = Promise;
colback.deferred = Q.defer;

// Arguments signatures
var signatures = {
  classical: function(args) {
    var a = atoa(args),
        cbl = 0,
        l = a.length,
        i;

    // Counting number of callbacks in reverse order up to two
    for (i = l - 1; i >= 0; i--) {
      if (typeof a[i] === 'function' && cbl < 2)
        cbl++;
    }

    if (cbl === 1)
      return {
        callback: a[l - 1],
        errback: noop,
        rest: l > 1 ? a.slice(0, -1) : []
      };
    else
      return {
        callback: a[l - 2],
        errback: a[l - 1],
        rest: l > 2 ? a.slice(0, -2) : []
      };
  },
  baroque: function(args) {
    var a = atoa(args),
        cbl = 0,
        l = a.length,
        i;

    // Counting number of callbacks in reverse order up to two
    for (i = l - 1; i >= 0; i--) {
      if (typeof a[i] === 'function' && cbl < 2)
        cbl++;
    }

    if (cbl === 1)
      return {
        errback: a[l - 1],
        callback: noop,
        rest: l > 1 ? a.slice(0, -1) : []
      };
    else
      return {
        errback: a[l - 2],
        callback: a[l - 1],
        rest: l > 2 ? a.slice(0, -2) : []
      };
  },
  modern: function(args) {
    var a = atoa(args),
        l = a.length;

    return {
      callback: a[l - 1],
      rest: l > 1 ? a.slice(0, -1) : []
    };
  },
  promise: function(args) {
    return {
      rest: atoa(args)
    };
  },
  deferred: function(args) {
    return {
      rest: atoa(args)
    };
  }
};

// Forge
function make(fn, scope, from, to, engine) {
  engine = (to === 'promise' ? colback.promise : colback.deferred) || engine;

  // The idea here is always to analyze the target paradigm argument signature
  // to then apply it in a correct fashion to the original function.
  var cases = {

    // From classical
    classical: {
      baroque: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest.concat([a.callback, a.errback]));
        };
      },
      modern: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest.concat([
            function(result) {
              a.callback(null, result);
            },
            function(err) {
              a.callback(err || true);
            }
          ]));
        };
      },
      promise: function(signature) {
        return function() {
          var a = signature(arguments);

          return new engine(function(resolve, reject) {
            fn.apply(scope, a.rest.concat([
              function(result) {
                resolve(result);
              },
              function(err) {
                reject(err);
              }
            ]));
          });
        };
      },
      deferred: function(signature) {
        return function() {
          var a = signature(arguments),
              deferred = colback.deferred();

          fn.apply(scope, a.rest.concat([
            function(result) {
              deferred.resolve(result);
            },
            function(err) {
              deferred.reject(err);
            }
          ]));

          return deferred.promise;
        };
      }
    },

    // From baroque
    baroque: {
      classical: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest.concat([a.errback, a.callback]));
        };
      },
      modern: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest.concat([
            function(err) {
              a.callback(err || true);
            },
            function(result) {
              a.callback(null, result);
            }
          ]));
        };
      },
      promise: function(signature) {
        return function() {
          var a = signature(arguments);

          return new engine(function(resolve, reject) {
            fn.apply(scope, a.rest.concat([
              function(err) {
                reject(err);
              },
              function(result) {
                resolve(result);
              }
            ]));
          });
        };
      },
      deferred: function(signature) {
        return function() {
          var a = signature(arguments),
              deferred = colback.deferred();

          fn.apply(scope, a.rest.concat([
            function(err) {
              deferred.reject(err);
            },
            function(result) {
              deferred.resolve(result);
            }
          ]));

          return deferred.promise;
        };
      }
    },

    // From modern
    modern: {
      classical: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest.concat(function(err, result) {
            if (!err)
              a.callback(result);
            else
              a.errback(err);
          }));
        };
      },
      baroque: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest.concat(function(err, result) {
            if (!err)
              a.callback(result);
            else
              a.errback(err);
          }));
        };
      },
      promise: function(signature) {
        return function() {
          var a = signature(arguments);
          return new engine(function(resolve, reject) {
            fn.apply(scope, a.rest.concat(function(err, result) {
              if (!err)
                resolve(result);
              else
                reject(err);
            }));
          });
        };
      },
      deferred: function(signature) {
        return function() {
          var a = signature(arguments),
              deferred = colback.deferred();

          fn.apply(scope, a.rest.concat(function(err, result) {
            if (!err)
              deferred.resolve(result);
            else
              deferred.reject(err);
          }));

          return deferred.promise;
        };
      }
    },

    // From promise
    promise: {
      classical: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest)
            .then(a.callback, a.errback);
        };
      },
      baroque: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest)
            .then(a.callback, a.errback);
        };
      },
      modern: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest)
            .then(
              function(result) {
                a.callback(null, result);
              },
              function(err) {
                a.callback(err || true);
              }
            );
        };
      },
      deferred: function(signature) {
        return function() {
          var a = signature(arguments),
              deferred = colback.deferred();

          fn.apply(scope, a.rest)
            .then(deferred.resolve, deferred.reject);

          return deferred.promise;
        };
      }
    },

    // From deferred
    deferred: {
      classical: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest)
            .then(a.callback)
            .fail(a.errback);
        };
      },
      baroque: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest)
            .then(a.callback)
            .fail(a.errback);
        };
      },
      modern: function(signature) {
        return function() {
          var a = signature(arguments);
          fn.apply(scope, a.rest)
            .then(function(result) {
              a.callback(null, result);
            })
            .fail(function(err) {
              a.callback(err || true);
            });
        };
      },
      promise: function(signature) {
        return function() {
          var a = signature(arguments);
          return new engine(function(resolve, reject) {
            fn.apply(scope, a.rest)
              .then(resolve)
              .fail(reject);
          });
        };
      }
    }
  };

  if (from === to)
    throw Error('colback: trying to shift a function to the same paradigm.');
  return cases[from][to](signatures[to]);
}

// Overloading
Object.defineProperty(colback, 'paradigms', {
  value: PARADIGMS
});

// Exporting
module.exports = colback;
