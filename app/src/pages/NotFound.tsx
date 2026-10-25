import { Link } from "react-router-dom"
import Terminal from "../components/Terminal"

const NotFound = () => (
	<Terminal title="404" tone="danger">
		<h2>SEGMENTATION FAULT</h2>
		<p>Nothing lives at this address. Not even a vulnerable contract.</p>
		<Link to="/">cd ~/levels</Link>
	</Terminal>
)

export default NotFound
