export function Logo(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 156 24" aria-hidden="true" {...props}>
      <path
        className="fill-sky-500"
        d="M10 1L2 4V10.5C2 16.5 5.5 21 10 22.5C14.5 21 18 16.5 18 10.5V4L10 1Z"
      />
      <path
        d="M11 5L7.5 11.5H10.5L8 18.5L15 10.5H11.5L14 5H11Z"
        fill="white"
        fillOpacity="0.9"
      />
      <text
        x="24"
        y="17"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="2"
        className="fill-zinc-900 dark:fill-white"
      >
        BLACKTHORN
      </text>
    </svg>
  )
}
