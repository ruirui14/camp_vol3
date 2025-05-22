//写真アップロード画面
import { useNavigate } from 'react-router-dom';

function Upload() {
    const navigate = useNavigate();

    const gotoChange = () => {
        navigate("/photo_change");
    }

    return(
        <>
        <h1>アップロードしろ</h1>
        <button onClick={gotoChange}>スーツチェンジ</button>
        </>
    )
}

export default Upload; 