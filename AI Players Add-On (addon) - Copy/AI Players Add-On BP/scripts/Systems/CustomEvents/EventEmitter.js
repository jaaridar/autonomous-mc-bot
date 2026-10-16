import { system } from "@minecraft/server";
/**
 * EventEmitter is a simple event system for subscribing, emitting, and unsubscribing custom events.
 * Use this class to create and manage your own event-driven systems.
 * @example
 * ```ts
 * const emitter = new EventEmitter<{ foo: [number] }>();
 * emitter.subscribe("foo", (n) => console.log(n));
 * emitter.emit("foo", 42);
 * ``` */ class _EventEmitter {
    /**
     * Emits an event, calling all subscribed handlers.
     * @param eventName - The name of the event.
     * @param eventArg - Arguments to pass to the handlers.
     */ emit(eventName, ...eventArg) {
        if (this.events[eventName]) {
            this.events[eventName].forEach((callback)=>{
                try {
                    callback(...eventArg);
                } catch (error) {
                    const functionName = callback.name || "anonymous";
                    console.error(`Error in event listener callback! Args = eventName: ${eventName}; error: ${error}; functionName: ${functionName}`);
                }
            });
        }
    }
    /**
     * Subscribes a handler to an event.
     * @param eventName - The name of the event.
     * @param handler - The handler function to call when the event is emitted.
     */ subscribe(eventName, handler) {
        if (!this.events[eventName]) {
            this.events[eventName] = [];
        }
        this.events[eventName].push(handler);
    }
    /**
     * Unsubscribes a handler from an event.
     * @param eventName - The name of the event.
     * @param handler - The handler function to remove.
     */ unsubscribe(eventName, handler) {
        if (this.events[eventName]) {
            this.events[eventName] = this.events[eventName].filter((cb)=>cb !== handler);
        }
    }
    /**
     * Logs the current event subscriptions to the console. This is useful for debugging and monitoring event usage. Not meant to be called directly.
     */ onTick() {
        const counts = {};
        let string = "";
        for(const event in this.events){
            counts[event] = this.events[event].length;
            string += `${event}: ${counts[event]}\n`;
        }
        console.warn(string);
    }
    constructor(log = false){
        this.events = {};
        if (log) system.runInterval(()=>this.onTick(), 20);
    }
}
globalThis.EventEmitter = _EventEmitter;
export { _EventEmitter as EventEmitter };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkV2ZW50RW1pdHRlci50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBzeXN0ZW0gfSBmcm9tIFwiQG1pbmVjcmFmdC9zZXJ2ZXJcIjtcclxuXHJcbi8qKlxyXG4gKiBFdmVudEVtaXR0ZXIgaXMgYSBzaW1wbGUgZXZlbnQgc3lzdGVtIGZvciBzdWJzY3JpYmluZywgZW1pdHRpbmcsIGFuZCB1bnN1YnNjcmliaW5nIGN1c3RvbSBldmVudHMuXHJcbiAqIFVzZSB0aGlzIGNsYXNzIHRvIGNyZWF0ZSBhbmQgbWFuYWdlIHlvdXIgb3duIGV2ZW50LWRyaXZlbiBzeXN0ZW1zLlxyXG4gKiBAZXhhbXBsZVxyXG4gKiBgYGB0c1xyXG4gKiBjb25zdCBlbWl0dGVyID0gbmV3IEV2ZW50RW1pdHRlcjx7IGZvbzogW251bWJlcl0gfT4oKTtcclxuICogZW1pdHRlci5zdWJzY3JpYmUoXCJmb29cIiwgKG4pID0+IGNvbnNvbGUubG9nKG4pKTtcclxuICogZW1pdHRlci5lbWl0KFwiZm9vXCIsIDQyKTtcclxuICogYGBgICovXHJcbmNsYXNzIF9FdmVudEVtaXR0ZXI8VEV2ZW50cyBleHRlbmRzIFJlY29yZDxzdHJpbmcsIFRFdmVudHNbc3RyaW5nXVtdPj4ge1xyXG4gICAgcHJpdmF0ZSBldmVudHM6IFJlY29yZDxzdHJpbmcsICgoLi4uYXJncykgPT4gdm9pZClbXT47XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKGxvZyA9IGZhbHNlKSB7XHJcbiAgICAgICAgdGhpcy5ldmVudHMgPSB7fTtcclxuXHJcbiAgICAgICAgaWYgKGxvZykgc3lzdGVtLnJ1bkludGVydmFsKCgpID0+IHRoaXMub25UaWNrKCksIDIwKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIEVtaXRzIGFuIGV2ZW50LCBjYWxsaW5nIGFsbCBzdWJzY3JpYmVkIGhhbmRsZXJzLlxyXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBldmVudC5cclxuICAgICAqIEBwYXJhbSBldmVudEFyZyAtIEFyZ3VtZW50cyB0byBwYXNzIHRvIHRoZSBoYW5kbGVycy5cclxuICAgICAqL1xyXG4gICAgcHVibGljIGVtaXQ8VEV2ZW50TmFtZSBleHRlbmRzIGtleW9mIFRFdmVudHMgJiBzdHJpbmc+KGV2ZW50TmFtZTogVEV2ZW50TmFtZSwgLi4uZXZlbnRBcmc6IFRFdmVudHNbVEV2ZW50TmFtZV0pIHtcclxuICAgICAgICBpZiAodGhpcy5ldmVudHNbZXZlbnROYW1lXSkge1xyXG4gICAgICAgICAgICB0aGlzLmV2ZW50c1tldmVudE5hbWVdLmZvckVhY2goKGNhbGxiYWNrKSA9PiB7XHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKC4uLmV2ZW50QXJnKTtcclxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnVuY3Rpb25OYW1lID0gY2FsbGJhY2submFtZSB8fCBcImFub255bW91c1wiO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBFcnJvciBpbiBldmVudCBsaXN0ZW5lciBjYWxsYmFjayEgQXJncyA9IGV2ZW50TmFtZTogJHtldmVudE5hbWV9OyBlcnJvcjogJHtlcnJvcn07IGZ1bmN0aW9uTmFtZTogJHtmdW5jdGlvbk5hbWV9YFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFN1YnNjcmliZXMgYSBoYW5kbGVyIHRvIGFuIGV2ZW50LlxyXG4gICAgICogQHBhcmFtIGV2ZW50TmFtZSAtIFRoZSBuYW1lIG9mIHRoZSBldmVudC5cclxuICAgICAqIEBwYXJhbSBoYW5kbGVyIC0gVGhlIGhhbmRsZXIgZnVuY3Rpb24gdG8gY2FsbCB3aGVuIHRoZSBldmVudCBpcyBlbWl0dGVkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgc3Vic2NyaWJlPFRFdmVudE5hbWUgZXh0ZW5kcyBrZXlvZiBURXZlbnRzICYgc3RyaW5nPihcclxuICAgICAgICBldmVudE5hbWU6IFRFdmVudE5hbWUsXHJcbiAgICAgICAgaGFuZGxlcjogKC4uLmV2ZW50QXJnOiBURXZlbnRzW1RFdmVudE5hbWVdKSA9PiB2b2lkXHJcbiAgICApIHtcclxuICAgICAgICBpZiAoIXRoaXMuZXZlbnRzW2V2ZW50TmFtZV0pIHtcclxuICAgICAgICAgICAgdGhpcy5ldmVudHNbZXZlbnROYW1lXSA9IFtdO1xyXG4gICAgICAgIH1cclxuICAgICAgICB0aGlzLmV2ZW50c1tldmVudE5hbWVdLnB1c2goaGFuZGxlcik7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBVbnN1YnNjcmliZXMgYSBoYW5kbGVyIGZyb20gYW4gZXZlbnQuXHJcbiAgICAgKiBAcGFyYW0gZXZlbnROYW1lIC0gVGhlIG5hbWUgb2YgdGhlIGV2ZW50LlxyXG4gICAgICogQHBhcmFtIGhhbmRsZXIgLSBUaGUgaGFuZGxlciBmdW5jdGlvbiB0byByZW1vdmUuXHJcbiAgICAgKi9cclxuICAgIHB1YmxpYyB1bnN1YnNjcmliZTxURXZlbnROYW1lIGV4dGVuZHMga2V5b2YgVEV2ZW50cyAmIHN0cmluZz4oXHJcbiAgICAgICAgZXZlbnROYW1lOiBURXZlbnROYW1lLFxyXG4gICAgICAgIGhhbmRsZXI6ICguLi5ldmVudEFyZzogVEV2ZW50c1tURXZlbnROYW1lXSkgPT4gdm9pZFxyXG4gICAgKSB7XHJcbiAgICAgICAgaWYgKHRoaXMuZXZlbnRzW2V2ZW50TmFtZV0pIHtcclxuICAgICAgICAgICAgdGhpcy5ldmVudHNbZXZlbnROYW1lXSA9IHRoaXMuZXZlbnRzW2V2ZW50TmFtZV0uZmlsdGVyKChjYikgPT4gY2IgIT09IGhhbmRsZXIpO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIExvZ3MgdGhlIGN1cnJlbnQgZXZlbnQgc3Vic2NyaXB0aW9ucyB0byB0aGUgY29uc29sZS4gVGhpcyBpcyB1c2VmdWwgZm9yIGRlYnVnZ2luZyBhbmQgbW9uaXRvcmluZyBldmVudCB1c2FnZS4gTm90IG1lYW50IHRvIGJlIGNhbGxlZCBkaXJlY3RseS5cclxuICAgICAqL1xyXG4gICAgcHVibGljIG9uVGljaygpIHtcclxuICAgICAgICBjb25zdCBjb3VudHM6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4gPSB7fTtcclxuICAgICAgICBsZXQgc3RyaW5nID0gXCJcIjtcclxuICAgICAgICBmb3IgKGNvbnN0IGV2ZW50IGluIHRoaXMuZXZlbnRzKSB7XHJcbiAgICAgICAgICAgIGNvdW50c1tldmVudF0gPSB0aGlzLmV2ZW50c1tldmVudF0ubGVuZ3RoO1xyXG4gICAgICAgICAgICBzdHJpbmcgKz0gYCR7ZXZlbnR9OiAke2NvdW50c1tldmVudF19XFxuYDtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc29sZS53YXJuKHN0cmluZyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmRlY2xhcmUgZ2xvYmFsIHtcclxuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby12YXJcclxuICAgIHZhciBFdmVudEVtaXR0ZXI6IHR5cGVvZiBfRXZlbnRFbWl0dGVyO1xyXG59XHJcbmdsb2JhbFRoaXMuRXZlbnRFbWl0dGVyID0gX0V2ZW50RW1pdHRlcjtcclxuXHJcbmV4cG9ydCB7IF9FdmVudEVtaXR0ZXIgYXMgRXZlbnRFbWl0dGVyIH07XHJcbiJdLCJuYW1lcyI6WyJzeXN0ZW0iLCJfRXZlbnRFbWl0dGVyIiwiZW1pdCIsImV2ZW50TmFtZSIsImV2ZW50QXJnIiwiZXZlbnRzIiwiZm9yRWFjaCIsImNhbGxiYWNrIiwiZXJyb3IiLCJmdW5jdGlvbk5hbWUiLCJuYW1lIiwiY29uc29sZSIsInN1YnNjcmliZSIsImhhbmRsZXIiLCJwdXNoIiwidW5zdWJzY3JpYmUiLCJmaWx0ZXIiLCJjYiIsIm9uVGljayIsImNvdW50cyIsInN0cmluZyIsImV2ZW50IiwibGVuZ3RoIiwid2FybiIsImxvZyIsInJ1bkludGVydmFsIiwiZ2xvYmFsVGhpcyIsIkV2ZW50RW1pdHRlciJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsTUFBTSxRQUFRLG9CQUFvQjtBQUUzQzs7Ozs7Ozs7T0FRTyxHQUNQLE1BQU1DO0lBU0Y7Ozs7S0FJQyxHQUNELEFBQU9DLEtBQWdEQyxTQUFxQixFQUFFLEdBQUdDLFFBQTZCLEVBQUU7UUFDNUcsSUFBSSxJQUFJLENBQUNDLE1BQU0sQ0FBQ0YsVUFBVSxFQUFFO1lBQ3hCLElBQUksQ0FBQ0UsTUFBTSxDQUFDRixVQUFVLENBQUNHLE9BQU8sQ0FBQyxDQUFDQztnQkFDNUIsSUFBSTtvQkFDQUEsWUFBWUg7Z0JBQ2hCLEVBQUUsT0FBT0ksT0FBTztvQkFDWixNQUFNQyxlQUFlRixTQUFTRyxJQUFJLElBQUk7b0JBQ3RDQyxRQUFRSCxLQUFLLENBQ1QsQ0FBQyxvREFBb0QsRUFBRUwsVUFBVSxTQUFTLEVBQUVLLE1BQU0sZ0JBQWdCLEVBQUVDLGFBQWEsQ0FBQztnQkFFMUg7WUFDSjtRQUNKO0lBQ0o7SUFFQTs7OztLQUlDLEdBQ0QsQUFBT0csVUFDSFQsU0FBcUIsRUFDckJVLE9BQW1ELEVBQ3JEO1FBQ0UsSUFBSSxDQUFDLElBQUksQ0FBQ1IsTUFBTSxDQUFDRixVQUFVLEVBQUU7WUFDekIsSUFBSSxDQUFDRSxNQUFNLENBQUNGLFVBQVUsR0FBRyxFQUFFO1FBQy9CO1FBQ0EsSUFBSSxDQUFDRSxNQUFNLENBQUNGLFVBQVUsQ0FBQ1csSUFBSSxDQUFDRDtJQUNoQztJQUVBOzs7O0tBSUMsR0FDRCxBQUFPRSxZQUNIWixTQUFxQixFQUNyQlUsT0FBbUQsRUFDckQ7UUFDRSxJQUFJLElBQUksQ0FBQ1IsTUFBTSxDQUFDRixVQUFVLEVBQUU7WUFDeEIsSUFBSSxDQUFDRSxNQUFNLENBQUNGLFVBQVUsR0FBRyxJQUFJLENBQUNFLE1BQU0sQ0FBQ0YsVUFBVSxDQUFDYSxNQUFNLENBQUMsQ0FBQ0MsS0FBT0EsT0FBT0o7UUFDMUU7SUFDSjtJQUVBOztLQUVDLEdBQ0QsQUFBT0ssU0FBUztRQUNaLE1BQU1DLFNBQWlDLENBQUM7UUFDeEMsSUFBSUMsU0FBUztRQUNiLElBQUssTUFBTUMsU0FBUyxJQUFJLENBQUNoQixNQUFNLENBQUU7WUFDN0JjLE1BQU0sQ0FBQ0UsTUFBTSxHQUFHLElBQUksQ0FBQ2hCLE1BQU0sQ0FBQ2dCLE1BQU0sQ0FBQ0MsTUFBTTtZQUN6Q0YsVUFBVSxDQUFDLEVBQUVDLE1BQU0sRUFBRSxFQUFFRixNQUFNLENBQUNFLE1BQU0sQ0FBQyxFQUFFLENBQUM7UUFDNUM7UUFDQVYsUUFBUVksSUFBSSxDQUFDSDtJQUNqQjtJQWxFQSxZQUFtQkksTUFBTSxLQUFLLENBQUU7UUFDNUIsSUFBSSxDQUFDbkIsTUFBTSxHQUFHLENBQUM7UUFFZixJQUFJbUIsS0FBS3hCLE9BQU95QixXQUFXLENBQUMsSUFBTSxJQUFJLENBQUNQLE1BQU0sSUFBSTtJQUNyRDtBQStESjtBQU1BUSxXQUFXQyxZQUFZLEdBQUcxQjtBQUUxQixTQUFTQSxpQkFBaUIwQixZQUFZLEdBQUcifQ==