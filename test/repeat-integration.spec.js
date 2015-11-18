import {DOM} from 'aurelia-pal';
import {initialize as initializeBrowserPal} from 'aurelia-pal-browser';
import {Container} from 'aurelia-dependency-injection';
import {configure as configureBindingLanguage} from 'aurelia-templating-binding';
import {
  ViewCompiler,
  ViewResources,
  HtmlBehaviorResource,
  BehaviorInstruction,
  ViewSlot
} from 'aurelia-templating';
import {Repeat} from '../src/repeat';
import {OneTimeBindingBehavior} from '../src/binding-mode-behaviors';
import {metadata} from 'aurelia-metadata';
import {TaskQueue} from 'aurelia-task-queue';
import {ObserverLocator} from 'aurelia-binding';

// use the browser PAL implementation.
initializeBrowserPal();

// create the root container.
let container = new Container();

// register the standard binding language implementation.
configureBindingLanguage({ container });

// create the root view resources.
function createViewResources(container) {
  let resources = new ViewResources();

  // repeat
  let resource = metadata.get(metadata.resource, Repeat);
  resource.target = Repeat;
  resource.initialize(container, Repeat);
  resources.registerAttribute('repeat', resource, 'repeat');
  container.registerInstance(ViewResources, resources);

  // slice value converter
  resources.registerValueConverter('slice', { toView: array => array ? array.slice(0) : array });

  // toLength value converter
  resources.registerValueConverter('toLength', { toView: collection => collection ? (collection.length || collection.size || 0) : 0 });

  // no-op binding behavior
  resources.registerBindingBehavior('noopBehavior', { bind: () => {}, unbind: () => {} });

  // oneTime binding behavior
  resources.registerBindingBehavior('oneTime', new OneTimeBindingBehavior());
}
createViewResources(container);

// create the view compiler.
let viewCompiler = container.get(ViewCompiler);

// create the host element and view-slot for all the tests
let host = DOM.createElement('div');
DOM.appendNode(host);
let viewSlot = new ViewSlot(host, true);

// creates a controller given a html template string and a viewmodel instance.
function createController(template, viewModel) {
  let childContainer = container.createChild();

  let viewFactory = viewCompiler.compile(template);

  let metadata = new HtmlBehaviorResource();
  function App() {}
  metadata.initialize(childContainer, App);
  metadata.elementName = metadata.htmlName = 'app';

  let controller = metadata.create(childContainer, BehaviorInstruction.dynamic(host, viewModel, viewFactory));
  controller.automate();

  viewSlot.removeAll();
  viewSlot.add(controller.view);

  return controller;
}

// functions to test repeat output
function select(controller, selector) {
  return Array.prototype.slice.call(host.querySelectorAll(selector));
}
function selectContent(controller, selector) {
  return select(controller, selector).map(el => el.textContent);
}

// async queue
function createAssertionQueue() {
  let queue = [];

  let next;
  next = () => {
    if (queue.length) {
      let func = queue.pop();
      setTimeout(() => {
        func();
        next();
      })
    }
  };

  return func => {
    queue.push(func);
    if (queue.length === 1) {
      next();
    }
  };
}
let nq = createAssertionQueue();

// convenience methods for checking whether a property or collection is being observed.
let observerLocator = container.get(ObserverLocator);
function hasSubscribers(obj, propertyName) {
  return observerLocator.getObserver(obj, propertyName).hasSubscribers();
}
function hasArraySubscribers(array) {
  return observerLocator.getArrayObserver(array).hasSubscribers();
}

describe('Repeat array', () => {
  let viewModel, controller;

  function validateState() {
    // validate DOM
    let expectedContent = viewModel.items.map(x => x === null || x === undefined ? '' : x.toString());
    expect(selectContent(controller, 'div')).toEqual(expectedContent);

    // validate contextual data
    let views = controller.view.children[0].children;
    for (let i = 0; i < viewModel.items.length; i++) {
      expect(views[i].bindingContext.item).toBe(viewModel.items[i]);
      let overrideContext = views[i].overrideContext;
      expect(overrideContext.parentOverrideContext.bindingContext).toBe(viewModel);
      expect(overrideContext.bindingContext).toBe(views[i].bindingContext);
      let first = i === 0;
      let last = i === viewModel.items.length - 1;
      let even = i % 2 === 0;
      expect(overrideContext.$index).toBe(i);
      expect(overrideContext.$first).toBe(first);
      expect(overrideContext.$last).toBe(last);
      expect(overrideContext.$middle).toBe(!first && !last);
      expect(overrideContext.$odd).toBe(!even);
      expect(overrideContext.$even).toBe(even);
    }
  }

  describe('direct expression', () => {
    beforeEach(() => {
      let template = `<template><div repeat.for="item of items">\${item}</div></template>`;
      viewModel = { items: ['a', 'b', 'c'] };
      controller = createController(template, viewModel);
      validateState();
    });

    afterEach(() => {
      controller.unbind();
      expect(hasSubscribers(viewModel, 'items')).toBe(false);
      expect(hasArraySubscribers(viewModel.items)).toBe(false);
    });

    it('handles push', done => {
      viewModel.items.push('d');
      nq(() => validateState());
      nq(() => viewModel.items.push('e', 'f'));
      nq(() => validateState());
      nq(() => viewModel.items.push());
      nq(() => validateState());
      nq(() => done());
    });

    it('handles pop', done => {
      viewModel.items.pop();
      nq(() => validateState());
      nq(() => {
        viewModel.items.pop();
//        viewModel.items.pop();  // todo: report bug
      });
      nq(() => validateState());
      nq(() => viewModel.items.pop());
      nq(() => validateState());
      nq(() => done());
    });

    it('handles unshift', done => {
      viewModel.items.unshift('z');
      nq(() => validateState());
      nq(() => viewModel.items.unshift('y', 'x'));
      nq(() => validateState());
      nq(() => viewModel.items.unshift());
      nq(() => validateState());
      nq(() => done());
    });

    it('handles shift', done => {
      viewModel.items.shift();
      nq(() => validateState());
      nq(() => {
        viewModel.items.shift();
  //      viewModel.items.shift();  // todo: report bug
      });
      nq(() => validateState());
      nq(() => viewModel.items.shift());
      nq(() => validateState());
      nq(() => done());
    });

    it('handles sort and reverse', done => {
      viewModel.items.reverse();
      nq(() => validateState());
      nq(() => viewModel.items.sort());
      nq(() => validateState());
      nq(() => viewModel.items.reverse());
      nq(() => validateState());
      nq(() => viewModel.items.sort());
      nq(() => validateState());
      nq(() => done());
    });

    it('handles splice', done => {
      viewModel.items.splice(2, 1, 'x', 'y');
      nq(() => validateState());
      nq(() => done());
    });

    // todo: splice edge cases... negative, no-args, invalid args, etc

    it('handles property change', done => {
      let observer = observerLocator.getArrayObserver(viewModel.items);
      viewModel.items = null;
      nq(() => {
        expect(select(controller, 'div').length).toBe(0);
        expect(observer.hasSubscribers()).toBe(false);
      });
      nq(() => {
        viewModel.items = ['x', 'y', 'z'];
        observer = observerLocator.getArrayObserver(viewModel.items);
      });
      nq(() => {
        validateState();
        viewModel.items = undefined;
      });
      nq(() => {
        expect(select(controller, 'div').length).toBe(0);
        expect(observer.hasSubscribers()).toBe(false);
      });
      nq(() => viewModel.items = []);
      nq(() => validateState());
      nq(() => done());
    });
  });

  describe('with converter and behavior', () => {
    beforeEach(() => {
      let template = `<template><div repeat.for="item of items | slice & noopBehavior">\${item}</div></template>`;
      viewModel = { items: ['a', 'b', 'c'] };
      controller = createController(template, viewModel);
      validateState();
    });

    afterEach(() => {
      controller.unbind();
      expect(hasSubscribers(viewModel, 'items')).toBe(false);
      expect(hasArraySubscribers(viewModel.items)).toBe(false);
    });

    it('handles mutation', done => {
      viewModel.items.push('d');
      nq(() => validateState());
      nq(() => viewModel.items.pop());
      nq(() => validateState());
      nq(() => viewModel.items.reverse());
      nq(() => validateState());
      nq(() => done());
    });

    it('handles property change', done => {
      let observer = observerLocator.getArrayObserver(viewModel.items);
      viewModel.items = null;
      nq(() => {
        expect(select(controller, 'div').length).toBe(0);
        expect(observer.hasSubscribers()).toBe(false);
      });
      nq(() => {
        viewModel.items = ['x', 'y', 'z'];
        observer = observerLocator.getArrayObserver(viewModel.items);
      });
      nq(() => {
        validateState();
        viewModel.items = undefined;
      });
      nq(() => {
        expect(select(controller, 'div').length).toBe(0);
        expect(observer.hasSubscribers()).toBe(false);
      });
      nq(() => viewModel.items = []);
      nq(() => validateState());
      nq(() => done());
    });
  });

  describe('with converter that changes type', () => {
    beforeEach(() => {
      let template = `<template><div repeat.for="item of items | toLength">\${item}</div></template>`;
      viewModel = { items: [0, 1, 2] };
      controller = createController(template, viewModel);
      validateState();
    });

    afterEach(() => {
      controller.unbind();
      expect(hasSubscribers(viewModel, 'items')).toBe(false);
      expect(hasArraySubscribers(viewModel.items)).toBe(false);
    });

    it('handles mutation', done => {
      viewModel.items.push(3);
      nq(() => validateState());
      nq(() => viewModel.items.pop());
      nq(() => validateState());
      nq(() => done());
    });

    it('handles property change', done => {
      let observer = observerLocator.getArrayObserver(viewModel.items);
      viewModel.items = null;
      nq(() => {
        expect(select(controller, 'div').length).toBe(0);
        expect(observer.hasSubscribers()).toBe(false);
      });
      nq(() => {
        viewModel.items = [0, 1, 2];
        observer = observerLocator.getArrayObserver(viewModel.items);
      });
      nq(() => {
        validateState();
        viewModel.items = undefined;
      });
      nq(() => {
        expect(select(controller, 'div').length).toBe(0);
        expect(observer.hasSubscribers()).toBe(false);
      });
      nq(() => viewModel.items = []);
      nq(() => validateState());
      nq(() => done());
    });
  });

  it('oneTime does not observe changes', () => {
    let template = `<template><div repeat.for="item of items & oneTime">\${item}</div></template>`;
    viewModel = { items: [0, 1, 2] };
    controller = createController(template, viewModel);
    validateState();
    expect(hasSubscribers(viewModel, 'items')).toBe(false);
    expect(hasArraySubscribers(viewModel.items)).toBe(false);
    controller.unbind();
  });
});

describe('Repeat map', () => {
  let viewModel, controller;
});

describe('Repeat number', () => {
  let viewModel, controller;
});

describe('Repeat object converted to collection', () => {
  let viewModel, controller;
});