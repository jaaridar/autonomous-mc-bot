import { system } from "@minecraft/server";
/**
 * A fixed-size generic buffer for storing the last N values pushed.
 * Use this class to keep a rolling history of values, such as recent events or measurements.
 * @example
 * ```ts
 * const buffer = new GenericBuffer<number, 5>(5, 0);
 * buffer.push(1);
 * buffer.push(2);
 * const value = buffer.get(0); // 2
 * ``` */ class _GenericBuffer {
    /**
     * Pushes a value to the front of the buffer, removing the oldest if over capacity.
     * @param value - The value to add.
     */ push(value) {
        this.buffer.unshift(value);
        if (this.buffer.length > this.size) {
            this.buffer.pop();
        }
    }
    /**
     * Gets the value at the specified index, or the default value if out of bounds.
     * @param index - The index to retrieve (0 is most recent).
     * @returns The value at the index, or the default value if out of bounds.
     */ get(index) {
        // @ts-ignore
        return this.buffer.length <= index ? this.defaultValue : this.buffer[index];
    }
    constructor(size, defaultValue){
        this.size = size;
        this.defaultValue = defaultValue;
        this.shouldLog = false;
        this.buffer = [];
        if (this.shouldLog) system.runInterval(()=>{
            console.warn(this.buffer.length, JSON.stringify(this.buffer));
        });
    }
}
globalThis.GenericBuffer = _GenericBuffer;

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkdlbmVyaWNCdWZmZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgc3lzdGVtIH0gZnJvbSBcIkBtaW5lY3JhZnQvc2VydmVyXCI7XHJcblxyXG50eXBlIEVudW1lcmF0ZTxOIGV4dGVuZHMgbnVtYmVyLCBBY2MgZXh0ZW5kcyBudW1iZXJbXSA9IFtdPiA9IEFjY1tcImxlbmd0aFwiXSBleHRlbmRzIE4gPyBBY2NbbnVtYmVyXSA6IEVudW1lcmF0ZTxOLCBbLi4uQWNjLCBBY2NbXCJsZW5ndGhcIl1dPjtcclxuXHJcbi8qKlxyXG4gKiBBIGZpeGVkLXNpemUgZ2VuZXJpYyBidWZmZXIgZm9yIHN0b3JpbmcgdGhlIGxhc3QgTiB2YWx1ZXMgcHVzaGVkLlxyXG4gKiBVc2UgdGhpcyBjbGFzcyB0byBrZWVwIGEgcm9sbGluZyBoaXN0b3J5IG9mIHZhbHVlcywgc3VjaCBhcyByZWNlbnQgZXZlbnRzIG9yIG1lYXN1cmVtZW50cy5cclxuICogQGV4YW1wbGVcclxuICogYGBgdHNcclxuICogY29uc3QgYnVmZmVyID0gbmV3IEdlbmVyaWNCdWZmZXI8bnVtYmVyLCA1Pig1LCAwKTtcclxuICogYnVmZmVyLnB1c2goMSk7XHJcbiAqIGJ1ZmZlci5wdXNoKDIpO1xyXG4gKiBjb25zdCB2YWx1ZSA9IGJ1ZmZlci5nZXQoMCk7IC8vIDJcclxuICogYGBgICovXHJcbmNsYXNzIF9HZW5lcmljQnVmZmVyPFQsIE4gZXh0ZW5kcyBudW1iZXI+IHtcclxuICAgIHByaXZhdGUgcmVhZG9ubHkgc2hvdWxkTG9nID0gZmFsc2U7XHJcbiAgICBwcml2YXRlIHJlYWRvbmx5IGJ1ZmZlcjogVFtdID0gW107XHJcblxyXG4gICAgcHVibGljIGNvbnN0cnVjdG9yKFxyXG4gICAgICAgIHB1YmxpYyBzaXplOiBOLFxyXG4gICAgICAgIHB1YmxpYyBkZWZhdWx0VmFsdWU/OiBUXHJcbiAgICApIHtcclxuICAgICAgICBpZiAodGhpcy5zaG91bGRMb2cpXHJcbiAgICAgICAgICAgIHN5c3RlbS5ydW5JbnRlcnZhbCgoKSA9PiB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4odGhpcy5idWZmZXIubGVuZ3RoLCBKU09OLnN0cmluZ2lmeSh0aGlzLmJ1ZmZlcikpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFB1c2hlcyBhIHZhbHVlIHRvIHRoZSBmcm9udCBvZiB0aGUgYnVmZmVyLCByZW1vdmluZyB0aGUgb2xkZXN0IGlmIG92ZXIgY2FwYWNpdHkuXHJcbiAgICAgKiBAcGFyYW0gdmFsdWUgLSBUaGUgdmFsdWUgdG8gYWRkLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgcHVzaCh2YWx1ZTogVCkge1xyXG4gICAgICAgIHRoaXMuYnVmZmVyLnVuc2hpZnQodmFsdWUpO1xyXG4gICAgICAgIGlmICh0aGlzLmJ1ZmZlci5sZW5ndGggPiB0aGlzLnNpemUpIHtcclxuICAgICAgICAgICAgdGhpcy5idWZmZXIucG9wKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogR2V0cyB0aGUgdmFsdWUgYXQgdGhlIHNwZWNpZmllZCBpbmRleCwgb3IgdGhlIGRlZmF1bHQgdmFsdWUgaWYgb3V0IG9mIGJvdW5kcy5cclxuICAgICAqIEBwYXJhbSBpbmRleCAtIFRoZSBpbmRleCB0byByZXRyaWV2ZSAoMCBpcyBtb3N0IHJlY2VudCkuXHJcbiAgICAgKiBAcmV0dXJucyBUaGUgdmFsdWUgYXQgdGhlIGluZGV4LCBvciB0aGUgZGVmYXVsdCB2YWx1ZSBpZiBvdXQgb2YgYm91bmRzLlxyXG4gICAgICovXHJcbiAgICBwdWJsaWMgZ2V0KGluZGV4OiBFbnVtZXJhdGU8Tj4pOiBUIHwgdW5kZWZpbmVkIHtcclxuICAgICAgICAvLyBAdHMtaWdub3JlXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuYnVmZmVyLmxlbmd0aCA8PSBpbmRleCA/IHRoaXMuZGVmYXVsdFZhbHVlIDogdGhpcy5idWZmZXJbaW5kZXhdO1xyXG4gICAgfVxyXG59XHJcblxyXG5kZWNsYXJlIGdsb2JhbCB7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tdmFyXHJcbiAgICB2YXIgR2VuZXJpY0J1ZmZlcjogdHlwZW9mIF9HZW5lcmljQnVmZmVyO1xyXG59XHJcbmdsb2JhbFRoaXMuR2VuZXJpY0J1ZmZlciA9IF9HZW5lcmljQnVmZmVyO1xyXG4iXSwibmFtZXMiOlsic3lzdGVtIiwiX0dlbmVyaWNCdWZmZXIiLCJwdXNoIiwidmFsdWUiLCJidWZmZXIiLCJ1bnNoaWZ0IiwibGVuZ3RoIiwic2l6ZSIsInBvcCIsImdldCIsImluZGV4IiwiZGVmYXVsdFZhbHVlIiwic2hvdWxkTG9nIiwicnVuSW50ZXJ2YWwiLCJjb25zb2xlIiwid2FybiIsIkpTT04iLCJzdHJpbmdpZnkiLCJnbG9iYWxUaGlzIiwiR2VuZXJpY0J1ZmZlciJdLCJtYXBwaW5ncyI6IkFBQUEsU0FBU0EsTUFBTSxRQUFRLG9CQUFvQjtBQUkzQzs7Ozs7Ozs7O09BU08sR0FDUCxNQUFNQztJQWNGOzs7S0FHQyxHQUNELEFBQU9DLEtBQUtDLEtBQVEsRUFBRTtRQUNsQixJQUFJLENBQUNDLE1BQU0sQ0FBQ0MsT0FBTyxDQUFDRjtRQUNwQixJQUFJLElBQUksQ0FBQ0MsTUFBTSxDQUFDRSxNQUFNLEdBQUcsSUFBSSxDQUFDQyxJQUFJLEVBQUU7WUFDaEMsSUFBSSxDQUFDSCxNQUFNLENBQUNJLEdBQUc7UUFDbkI7SUFDSjtJQUVBOzs7O0tBSUMsR0FDRCxBQUFPQyxJQUFJQyxLQUFtQixFQUFpQjtRQUMzQyxhQUFhO1FBQ2IsT0FBTyxJQUFJLENBQUNOLE1BQU0sQ0FBQ0UsTUFBTSxJQUFJSSxRQUFRLElBQUksQ0FBQ0MsWUFBWSxHQUFHLElBQUksQ0FBQ1AsTUFBTSxDQUFDTSxNQUFNO0lBQy9FO0lBN0JBLFlBQ0ksQUFBT0gsSUFBTyxFQUNkLEFBQU9JLFlBQWdCLENBQ3pCO2FBRlNKLE9BQUFBO2FBQ0FJLGVBQUFBO2FBTE1DLFlBQVk7YUFDWlIsU0FBYyxFQUFFO1FBTTdCLElBQUksSUFBSSxDQUFDUSxTQUFTLEVBQ2RaLE9BQU9hLFdBQVcsQ0FBQztZQUNmQyxRQUFRQyxJQUFJLENBQUMsSUFBSSxDQUFDWCxNQUFNLENBQUNFLE1BQU0sRUFBRVUsS0FBS0MsU0FBUyxDQUFDLElBQUksQ0FBQ2IsTUFBTTtRQUMvRDtJQUNSO0FBc0JKO0FBTUFjLFdBQVdDLGFBQWEsR0FBR2xCIn0=