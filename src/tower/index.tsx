export function TowerScreen() {
  return <TowerLayout titleZone={<h1>Jesse Harlin</h1>} floorsZone={null} />;
}

type TowerLayoutProps = { titleZone: React.ReactNode; floorsZone: React.ReactNode };
function TowerLayout({ titleZone, floorsZone }: TowerLayoutProps) {
  return (
    <main>
      {titleZone}
      {floorsZone}
    </main>
  );
}
