const protocols = [
  { id: 'stop_and_wait', label: 'Stop-and-Wait' },
  { id: 'gbn', label: 'Go-Back-N' },
  { id: 'selective_repeat', label: 'Selective Repeat' },
]

export default function RdtProtocols() {
  return (
    <>
      <h1>Reliable Data Transfer</h1>
      <p>
        Pick a protocol, set the channel conditions, and watch the timeline
        stream in from the simulator.
      </p>
      <ul>
        {protocols.map((p) => (
          <li key={p.id}>
            {p.label} <code>{p.id}</code>
          </li>
        ))}
      </ul>
      {/* TODO: params form -> ws://.../ws/rdt-protocols/ -> animated timeline */}
    </>
  )
}
