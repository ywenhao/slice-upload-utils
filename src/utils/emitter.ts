interface DefaultEventType {
  [key: string]: (...args: any[]) => void
}

/**
 * 事件发射器
 */
export class Emitter<EventType extends DefaultEventType> {
  private eventsMap = new Map<keyof EventType, EventType[keyof EventType][]>()

  constructor() {}

  /**
   * 绑定事件
   */
  on<Key extends keyof EventType>(eventName: Key, cb: EventType[Key]) {
    const events = this.eventsMap.get(eventName) || []
    events.push(cb)
    this.eventsMap.set(eventName, events)
    return this
  }

  /**
     * 触发事件
     */
  emit<Key extends keyof EventType>(eventName: Key, ...args: Parameters<EventType[Key]>) {
    const events = this.eventsMap.get(eventName) || []
    events.forEach(cb => cb(...args))
    return this
  }

  /**
     * 取消事件
     */
  off<Key extends keyof EventType>(eventName: Key, cb?: EventType[Key]) {
    if (!cb) {
      this.eventsMap.set(eventName, [])
    }
    else {
      const events = this.eventsMap.get(eventName) || []
      this.eventsMap.set(eventName, events.filter(v => v !== cb))
    }
    return this
  }
}
