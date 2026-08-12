import { render } from 'preact';
import { App } from './App';
import './styles.css';
const root = document.getElementById('app');
if (!root) throw new Error('앱 루트를 찾지 못했습니다.');
render(<App />, root);
