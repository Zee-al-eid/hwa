var app = (function () {
    'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.wholeText !== data)
            text.data = data;
    }
    function set_style(node, key, value, important) {
        if (value === null) {
            node.style.removeProperty(key);
        }
        else {
            node.style.setProperty(key, value, important ? 'important' : '');
        }
    }
    function custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, bubbles, cancelable, detail);
        return e;
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error('Function called outside component initialization');
        return current_component;
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail, { cancelable = false } = {}) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail, { cancelable });
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
                return !event.defaultPrevented;
            }
            return true;
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    // flush() calls callbacks in this order:
    // 1. All beforeUpdate callbacks, in order: parents before children
    // 2. All bind:this callbacks, in reverse order: children before parents.
    // 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
    //    for afterUpdates called during the initial onMount, which are called in
    //    reverse order: children before parents.
    // Since callbacks might update component values, which could trigger another
    // call to flush(), the following steps guard against this:
    // 1. During beforeUpdate, any updated components will be added to the
    //    dirty_components array and will cause a reentrant call to flush(). Because
    //    the flush index is kept outside the function, the reentrant call will pick
    //    up where the earlier call left off and go through all dirty components. The
    //    current_component value is saved and restored so that the reentrant call will
    //    not interfere with the "parent" flush() call.
    // 2. bind:this callbacks cannot trigger new flush() calls.
    // 3. During afterUpdate, any updated components will NOT have their afterUpdate
    //    callback called a second time; the seen_callbacks set, outside the flush()
    //    function, guarantees this behavior.
    const seen_callbacks = new Set();
    let flushidx = 0; // Do *not* move this inside the flush() function
    function flush() {
        const saved_component = current_component;
        do {
            // first, call beforeUpdate functions
            // and update components
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            flushidx = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        seen_callbacks.clear();
        set_current_component(saved_component);
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
        else if (callback) {
            callback();
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor, customElement) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        if (!customElement) {
            // onMount happens before the initial afterUpdate
            add_render_callback(() => {
                const new_on_destroy = on_mount.map(run).filter(is_function);
                if (on_destroy) {
                    on_destroy.push(...new_on_destroy);
                }
                else {
                    // Edge case - component was destroyed immediately,
                    // most likely as a result of a binding initialising
                    run_all(new_on_destroy);
                }
                component.$$.on_mount = [];
            });
        }
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            on_disconnect: [],
            before_update: [],
            after_update: [],
            context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false,
            root: options.target || parent_component.$$.root
        };
        append_styles && append_styles($$.root);
        let ready = false;
        $$.ctx = instance
            ? instance(component, options.props || {}, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor, options.customElement);
            flush();
        }
        set_current_component(parent_component);
    }
    /**
     * Base class for Svelte components. Used when dev=false.
     */
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    /* src\Procedure.svelte generated by Svelte v3.49.0 */

    function create_fragment$3(ctx) {
    	let div;

    	return {
    		c() {
    			div = element("div");
    			div.innerHTML = `<img bp="offset-5@md 4@md 12@sm" src="handwashing.png" alt="How to wash your hands." class="svelte-1wsp3u5"/>`;
    			attr(div, "bp", "grid");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    		},
    		p: noop,
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    		}
    	};
    }

    class Procedure extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, null, create_fragment$3, safe_not_equal, {});
    	}
    }

    /* src\Progress.svelte generated by Svelte v3.49.0 */

    function create_fragment$2(ctx) {
    	let div2;
    	let div1;
    	let div0;

    	return {
    		c() {
    			div2 = element("div");
    			div1 = element("div");
    			div0 = element("div");
    			set_style(div0, "width", /*progress*/ ctx[0] + "%");
    			attr(div0, "class", "fill svelte-v2oc26");
    			attr(div1, "class", "bar svelte-v2oc26");
    			attr(div2, "class", "container svelte-v2oc26");
    			attr(div2, "bp", "full-width-until@md");
    		},
    		m(target, anchor) {
    			insert(target, div2, anchor);
    			append(div2, div1);
    			append(div1, div0);
    		},
    		p(ctx, [dirty]) {
    			if (dirty & /*progress*/ 1) {
    				set_style(div0, "width", /*progress*/ ctx[0] + "%");
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div2);
    		}
    	};
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let { progress = 0 } = $$props;

    	$$self.$$set = $$props => {
    		if ('progress' in $$props) $$invalidate(0, progress = $$props.progress);
    	};

    	return [progress];
    }

    class Progress extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { progress: 0 });
    	}
    }

    /* src\Timer.svelte generated by Svelte v3.49.0 */

    function create_fragment$1(ctx) {
    	let div;
    	let h20;
    	let t1;
    	let h21;
    	let t2;
    	let t3;
    	let progress_1;
    	let t4;
    	let button;
    	let t5;
    	let current;
    	let mounted;
    	let dispose;
    	progress_1 = new Progress({ props: { progress: /*progress*/ ctx[0] } });

    	return {
    		c() {
    			div = element("div");
    			h20 = element("h2");
    			h20.textContent = "Seconds Left:";
    			t1 = space();
    			h21 = element("h2");
    			t2 = text(/*secondsLeft*/ ctx[2]);
    			t3 = space();
    			create_component(progress_1.$$.fragment);
    			t4 = space();
    			button = element("button");
    			t5 = text("Start");
    			attr(h20, "class", "svelte-1lp5oj2");
    			attr(h21, "class", "sec svelte-1lp5oj2");
    			attr(div, "class", "svelte-1lp5oj2");
    			button.disabled = /*isRunning*/ ctx[1];
    			attr(button, "class", "start svelte-1lp5oj2");
    			attr(button, "bp", "full-width-until@md");
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			append(div, h20);
    			append(div, t1);
    			append(div, h21);
    			append(h21, t2);
    			insert(target, t3, anchor);
    			mount_component(progress_1, target, anchor);
    			insert(target, t4, anchor);
    			insert(target, button, anchor);
    			append(button, t5);
    			current = true;

    			if (!mounted) {
    				dispose = listen(button, "click", /*startTimer*/ ctx[3]);
    				mounted = true;
    			}
    		},
    		p(ctx, [dirty]) {
    			if (!current || dirty & /*secondsLeft*/ 4) set_data(t2, /*secondsLeft*/ ctx[2]);
    			const progress_1_changes = {};
    			if (dirty & /*progress*/ 1) progress_1_changes.progress = /*progress*/ ctx[0];
    			progress_1.$set(progress_1_changes);

    			if (!current || dirty & /*isRunning*/ 2) {
    				button.disabled = /*isRunning*/ ctx[1];
    			}
    		},
    		i(local) {
    			if (current) return;
    			transition_in(progress_1.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(progress_1.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(div);
    			if (detaching) detach(t3);
    			destroy_component(progress_1, detaching);
    			if (detaching) detach(t4);
    			if (detaching) detach(button);
    			mounted = false;
    			dispose();
    		}
    	};
    }

    const totalseconds = 20;

    function instance$1($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let progress;
    	let isRunning = false;
    	let secondsLeft = totalseconds;

    	const startTimer = () => {
    		dispatch("start");

    		const timer = setInterval(
    			() => {
    				$$invalidate(2, secondsLeft -= 1);
    				$$invalidate(1, isRunning = true);
    				$$invalidate(0, progress = (totalseconds - secondsLeft) / totalseconds * 100);

    				if (secondsLeft == 0) {
    					clearInterval(timer);
    					$$invalidate(2, secondsLeft = totalseconds);
    					$$invalidate(1, isRunning = false);
    					$$invalidate(0, progress = 0);
    					dispatch("end");
    				}
    			},
    			1000
    		);
    	};

    	return [progress, isRunning, secondsLeft, startTimer];
    }

    class Timer extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
    	}
    }

    /* src\App.svelte generated by Svelte v3.49.0 */

    function create_fragment(ctx) {
    	let main;
    	let h1;
    	let t1;
    	let timer;
    	let t2;
    	let procedure;
    	let t3;
    	let div;
    	let t7;
    	let audio0;
    	let t8;
    	let audio1;
    	let current;
    	timer = new Timer({});
    	timer.$on("start", /*timerStarts*/ ctx[3]);
    	timer.$on("end", /*timerEnds*/ ctx[2]);
    	procedure = new Procedure({});

    	return {
    		c() {
    			main = element("main");
    			h1 = element("h1");
    			h1.textContent = "Hand Washing App";
    			t1 = space();
    			create_component(timer.$$.fragment);
    			t2 = space();
    			create_component(procedure.$$.fragment);
    			t3 = space();
    			div = element("div");

    			div.innerHTML = `<h2 bp="padding-right--lg"><a href="https://www.unwater.org" target="_blank">Image Source</a></h2> 
    <h2><a href="https://pixabay.com/" target="_blank">Sound Source</a></h2>`;

    			t7 = space();
    			audio0 = element("audio");
    			audio0.innerHTML = `<source src="end.mp3"/>`;
    			t8 = space();
    			audio1 = element("audio");
    			audio1.innerHTML = `<source src="start.mp3"/>`;
    			attr(h1, "class", "svelte-1ouursg");
    			attr(div, "bp", "flex");
    			attr(main, "class", "svelte-1ouursg");
    		},
    		m(target, anchor) {
    			insert(target, main, anchor);
    			append(main, h1);
    			append(main, t1);
    			mount_component(timer, main, null);
    			append(main, t2);
    			mount_component(procedure, main, null);
    			append(main, t3);
    			append(main, div);
    			insert(target, t7, anchor);
    			insert(target, audio0, anchor);
    			/*audio0_binding*/ ctx[4](audio0);
    			insert(target, t8, anchor);
    			insert(target, audio1, anchor);
    			/*audio1_binding*/ ctx[5](audio1);
    			current = true;
    		},
    		p: noop,
    		i(local) {
    			if (current) return;
    			transition_in(timer.$$.fragment, local);
    			transition_in(procedure.$$.fragment, local);
    			current = true;
    		},
    		o(local) {
    			transition_out(timer.$$.fragment, local);
    			transition_out(procedure.$$.fragment, local);
    			current = false;
    		},
    		d(detaching) {
    			if (detaching) detach(main);
    			destroy_component(timer);
    			destroy_component(procedure);
    			if (detaching) detach(t7);
    			if (detaching) detach(audio0);
    			/*audio0_binding*/ ctx[4](null);
    			if (detaching) detach(t8);
    			if (detaching) detach(audio1);
    			/*audio1_binding*/ ctx[5](null);
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let startAudio;
    	let endAudio;

    	function timerEnds() {
    		endAudio.play();
    	}

    	function timerStarts() {
    		startAudio.play();
    	}

    	function audio0_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			endAudio = $$value;
    			$$invalidate(1, endAudio);
    		});
    	}

    	function audio1_binding($$value) {
    		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
    			startAudio = $$value;
    			$$invalidate(0, startAudio);
    		});
    	}

    	return [startAudio, endAudio, timerEnds, timerStarts, audio0_binding, audio1_binding];
    }

    class App extends SvelteComponent {
    	constructor(options) {
    		super();
    		init(this, options, instance, create_fragment, safe_not_equal, {});
    	}
    }

    const app = new App({
      target: document.body,
    });

    return app;

})();
//# sourceMappingURL=bundle.js.map
