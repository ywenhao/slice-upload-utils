interface DefaultEventType {
  [key: string]: (...args: any[]) => void
}

/**
 * Event emitter
 */
export class Emitter<EventType extends DefaultEventType> {
  private eventsMap = new Map<keyof EventType, EventType[keyof EventType][]>()

  /**
   * Bind an event
   */
  on<Key extends keyof EventType>(eventName: Key, cb: EventType[Key]) {
    const events = this.eventsMap.get(eventName) || []
    events.push(cb)
    this.eventsMap.set(eventName, events)
    return this
  }

  /**
   * Emit an event
   */
  emit<Key extends keyof EventType>(eventName: Key, ...args: Parameters<EventType[Key]>) {
    const events = this.eventsMap.get(eventName) || []
    events.slice().forEach((cb) => cb(...args))
    return this
  }

  /**
   * Remove an event
   */
  off<Key extends keyof EventType>(eventName: Key, cb?: EventType[Key]) {
    if (!cb) {
      this.eventsMap.delete(eventName)
    } else {
      const events = this.eventsMap.get(eventName) || []
      this.eventsMap.set(
        eventName,
        events.filter((v) => v !== cb),
      )
    }
    return this
  }
}
