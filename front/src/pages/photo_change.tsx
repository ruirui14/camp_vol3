//キャプチャ画面
import { useNavigate } from 'react-router-dom';

function PhotoChange() {
    const navigate = useNavigate();

    const gotoHome = () => {
        navigate("/home");
    }

    return(
        <>
        <h1>スーツに変身しちゃった！</h1>
        <button onClick={gotoHome}>おうちに戻るよ</button>
        </>
    )
}

export default PhotoChange;