import { registerAllGames } from './games';
import { Router } from './router';

registerAllGames();

function App() {
  return <Router />;
}

export default App
